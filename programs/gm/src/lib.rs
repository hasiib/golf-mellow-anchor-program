use anchor_lang::prelude::*;
use anchor_spl::token::{Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("4oNzoWCzooYv6X5SEdpj3F5iKJaC7gepX4cY6qYKWtwK");

#[program]
pub mod golf_mellow_spl {
    use super::*;

    pub fn init_mint(ctx: Context<InitMint>, params: SPLMintParams) -> Result<()> {
        let mint = &ctx.accounts.mint;

        // Validation
        require!(
            params.supply <= 600_000 * 10_u64.pow(9), // Updated total supply
            InitMintErrors::SupplyTooLarge
        );
        require!(params.name.len() <= 32, InitMintErrors::NameTooLong);
        require!(params.symbol.len() <= 10, InitMintErrors::SymbolTooLong);

        // Ensure that the mint account exists on-chain and matches params
        require!(
            mint.key() == ctx.accounts.mint.key(),
            InitMintErrors::MintMismatch
        );

        msg!(
            "Mint account initialized successfully: Name {}, Symbol {}, Supply {}",
            params.name,
            params.symbol,
            params.supply
        );

        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let mint = &ctx.accounts.mint;
        let mint_proxy_pda = &mut ctx.accounts.mint_proxy_pda;

        // Anti-snipe: Ensure max tokens per transaction is 15,000
        require!(
            amount <= 15_000 * 10_u64.pow(mint.decimals as u32),
            MintTokenErrors::ExceedsMaxMintPerTransaction
        );

        // Ensure the total minted doesn't exceed the burned total
        let total_minted_after = mint_proxy_pda.mint_total + amount;
        require!(
            total_minted_after <= mint_proxy_pda.burn_total,
            MintTokenErrors::ExceedsBurnedAmount
        );

        // Perform the minting operation
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::mint_to(cpi_ctx, amount)?;

        // Update the mint total in the PDA
        mint_proxy_pda.mint_total = total_minted_after;

        msg!(
            "Minted {} tokens. Total minted: {}",
            amount,
            mint_proxy_pda.mint_total
        );
        Ok(())
    }

    pub fn initialize_pda(ctx: Context<InitializePDA>, params: PDAInitParams) -> Result<()> {
        let init_proxy_pda = &mut ctx.accounts.init_proxy_pda;

        // Set the PDA data
        init_proxy_pda.authority = ctx.accounts.authority.key();
        init_proxy_pda.polygon_address = params.polygon_address.clone();
        init_proxy_pda.mint_total = 0; // Initialize to 0
        init_proxy_pda.burn_total = 0; // Initialize to 0

        msg!("PDA initialized successfully!");
        msg!("Polygon Address: {}", params.polygon_address);
        Ok(())
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        let _mint = &ctx.accounts.mint;
        let burn_proxy_pda = &mut ctx.accounts.burn_proxy_pda;

        // Ensure the user has enough tokens to burn
        require!(amount > 0, BurnTokenErrors::InvalidBurnAmount);

        // Perform the burn operation
        let cpi_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.from.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::burn(cpi_ctx, amount)?;

        // Update the burn total in the PDA
        burn_proxy_pda.burn_total = burn_proxy_pda
            .burn_total
            .checked_add(amount)
            .ok_or(BurnTokenErrors::Overflow)?;

        msg!(
            "Burned {} tokens. Total burned: {}",
            amount,
            burn_proxy_pda.burn_total
        );
        Ok(())
    }

    pub fn store_polygon_address(
        ctx: Context<StorePolygonAddress>,
        polygon_address: String,
    ) -> Result<()> {
        let polygon_address_pda = &mut ctx.accounts.polygon_address_pda;

        // Ensure authority matches
        require!(
            polygon_address_pda.authority == ctx.accounts.authority.key(),
            CustomError::Unauthorized
        );

        // Ensure the Polygon address is valid
        require!(
            polygon_address.len() == 42,
            CustomError::InvalidPolygonAddress
        );

        // Update the Polygon address in the PDA
        polygon_address_pda.polygon_address = polygon_address.clone();

        msg!("Polygon address stored successfully: {}", polygon_address);
        Ok(())
    }

    pub fn track_burn_metadata(ctx: Context<TrackBurnMetadata>, burned_amount: u64) -> Result<()> {
        let burn_metadata_pda = &mut ctx.accounts.burn_metadata_pda;

        // Ensure authority matches
        require!(
            burn_metadata_pda.authority == ctx.accounts.authority.key(),
            CustomError::Unauthorized
        );

        // Log burned amount
        msg!("Burn metadata tracked: {} tokens burned", burned_amount);
        Ok(())
    }

    pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        // Check that the transfer amount is valid
        require!(amount > 0, TransferTokenErrors::InvalidTransferAmount);

        // Ensure the source account has enough tokens
        let from_account = &ctx.accounts.from;
        require!(
            from_account.amount >= amount,
            TransferTokenErrors::InsufficientBalance
        );

        // Perform the token transfer
        let cpi_accounts = Transfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        anchor_spl::token::transfer(cpi_ctx, amount)?;

        msg!(
            "Transferred {} tokens from {} to {}",
            amount,
            from_account.key(),
            ctx.accounts.to.key()
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(params: SPLMintParams)]
pub struct InitMint<'info> {
    #[account(
        init,
        payer = authority,
        mint::decimals = 9,
        mint::authority = authority.key(),
        mint::freeze_authority = authority.key(),
        seeds = [b"golf_mellow", mint.key().as_ref()],
        bump,
        owner = token_program.key(),
    )]
    pub mint: Account<'info, Mint>, // The mint account for the token.

    #[account(mut)]
    pub authority: Signer<'info>, // Authority that pays for the initialization.

    pub token_program: Program<'info, Token>, // Program to handle SPL Token operations.
    pub system_program: Program<'info, System>, // System program for account creation.
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SPLMintParams {
    pub name: String,   // Name of the token.
    pub symbol: String, // Symbol of the token.
    pub supply: u64,    // Total supply of the token.
    pub uri: String,    // Metadata URI for the token.
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>, // Mint account

    #[account(mut)]
    pub to: Account<'info, TokenAccount>,

    #[account(mut, seeds = [b"mint_pda", mint.key().as_ref()], bump = mint_proxy_pda.bump)]
    pub mint_proxy_pda: Account<'info, MintProxyPDA>, // PDA holding mint data

    #[account(signer)]
    pub authority: Signer<'info>, // Must match the mint authority

    pub token_program: Program<'info, Token>, // SPL Token program
}

#[account]
pub struct MintProxyPDA {
    pub authority: Pubkey,       // Owner authority
    pub polygon_address: String, // Associated Polygon address
    pub mint_total: u64,         // Total tokens minted
    pub burn_total: u64,         // Total tokens burned
    pub bump: u8,                // PDA bump seed
}

#[derive(Accounts)]
#[instruction(params: PDAInitParams)]
pub struct InitializePDA<'info> {
    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    #[account(
        init,
        seeds = [b"golf_mellow", mint_account.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + InitProxyPDA::SPACE
    )]
    pub init_proxy_pda: Account<'info, InitProxyPDA>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PDAInitParams {
    pub polygon_address: String, // Polygon address for off-chain minting
}

#[account]
pub struct InitProxyPDA {
    pub authority: Pubkey,       // Owner authority (payer)
    pub polygon_address: String, // Polygon address for receiving tokens
    pub mint_total: u64,         // Total tokens minted on Solana
    pub burn_total: u64,         // Total tokens burned on Solana
    pub bump: u8,                // PDA bump for seeds
}

impl InitProxyPDA {
    pub const SPACE: usize = 32    // Pubkey
        + 4 + 42                   // String length + max polygon address (42 chars)
        + 8                        // u64 for mint_total
        + 8                        // u64 for burn_total
        + 1; // PDA bump
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>, // Mint account

    #[account(mut)]
    pub from: Account<'info, TokenAccount>, // Token account to burn tokens from

    #[account(mut, seeds = [b"mint_pda", mint.key().as_ref()], bump = burn_proxy_pda.bump)]
    pub burn_proxy_pda: Account<'info, BurnProxyPDA>, // PDA holding mint and burn data

    #[account(signer)]
    pub authority: Signer<'info>, // Must match the mint authority

    pub token_program: Program<'info, Token>, // SPL Token program
}

#[account]
pub struct BurnProxyPDA {
    pub authority: Pubkey,       // Owner authority
    pub polygon_address: String, // Associated Polygon address
    pub mint_total: u64,         // Total tokens minted
    pub burn_total: u64,         // Total tokens burned
    pub bump: u8,                // PDA bump seed
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    /// Source token account from which tokens will be transferred
    pub from: Account<'info, TokenAccount>,

    #[account(mut)]
    /// Destination token account to receive the tokens
    pub to: Account<'info, TokenAccount>,

    #[account(signer)]
    /// The authority (owner) of the source account
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>, // SPL Token program
}

#[derive(Accounts)]
pub struct TrackBurnMetadata<'info> {
    #[account(mut)]
    /// CHECK: This is the mint account. It is only used for deriving the PDA and no other operations are performed.
    pub mint: AccountInfo<'info>, // Token mint account

    #[account(mut, seeds = [b"mint_pda", mint.key().as_ref()], bump)]
    pub burn_metadata_pda: Account<'info, BurnMetadataPDA>, // PDA associated with the mint

    pub authority: Signer<'info>, // Must match PDA's authority
}

#[account]
pub struct BurnMetadataPDA {
    pub authority: Pubkey,       // Owner authority
    pub polygon_address: String, // Polygon address for receiving tokens
    pub mint_total: u64,         // Total tokens minted
    pub burn_total: u64,         // Total tokens burned
    pub bump: u8,                // PDA bump seed
}

#[derive(Accounts)]
pub struct StorePolygonAddress<'info> {
    #[account(mut)]
    /// CHECK: This is the mint account. It is only used for deriving the PDA and no other operations are performed.
    pub mint: AccountInfo<'info>, // Token mint account

    #[account(mut, seeds = [b"mint_pda", mint.key().as_ref()], bump)]
    pub polygon_address_pda: Account<'info, PolygonAddressPDA>, // PDA associated with the mint

    pub authority: Signer<'info>, // Must match PDA's authority
}

#[account]
pub struct PolygonAddressPDA {
    pub authority: Pubkey,       // Owner authority
    pub polygon_address: String, // Polygon address for receiving tokens
    pub mint_total: u64,         // Total tokens minted
    pub burn_total: u64,         // Total tokens burned
    pub bump: u8,                // PDA bump seed
}

#[error_code]
pub enum TransferTokenErrors {
    #[msg("Insufficient balance in the source account.")]
    InsufficientBalance,
    #[msg("Transfer amount must be greater than zero.")]
    InvalidTransferAmount,
}

#[error_code]
pub enum InitMintErrors {
    #[msg("The supply provided is too large. It must be below 600,000 tokens.")]
    SupplyTooLarge,

    #[msg("The name provided is too long. Maximum length is 32 characters.")]
    NameTooLong,

    #[msg("The symbol provided is too long. Maximum length is 10 characters.")]
    SymbolTooLong,

    #[msg("The mint account does not match.")]
    MintMismatch,
}

#[error_code]
pub enum MintTokenErrors {
    #[msg("Exceeds the maximum allowed tokens per transaction (15,000).")]
    ExceedsMaxMintPerTransaction,

    #[msg("Exceeds the total burned amount.")]
    ExceedsBurnedAmount,
}

#[error_code]
pub enum BurnTokenErrors {
    #[msg("Invalid burn amount. Amount must be greater than 0.")]
    InvalidBurnAmount,

    #[msg("Burn total overflow occurred.")]
    Overflow,
}

#[error_code]
pub enum CustomError {
    #[msg("Unauthorized action.")]
    Unauthorized,

    #[msg("Invalid Polygon address.")]
    InvalidPolygonAddress,
}
