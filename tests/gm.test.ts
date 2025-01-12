import * as anchor from "@coral-xyz/anchor"; // Import Anchor framework for Solana development
import { Program } from "@coral-xyz/anchor"; // Import Program type from Anchor
import { GolfMellowSpl } from "../target/types/golf_mellow_spl"; // Import the generated TypeScript types for your program
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js"; // Import Solana Web3.js utilities
import BN from "bn.js"; // Import BigNumber library for handling large integers

describe("golf_mellow_program_instructions", () => {
  // Initialize the Anchor provider for local testing
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  // Import the program using Anchor's workspace abstraction
  const program = anchor.workspace.GolfMellowSpl as Program<GolfMellowSpl>;

  // Set the program ID explicitly (matches the deployed program ID)
  const programId = new PublicKey("8LytJusdgxnfPBJZFBGMnvqQLY2ybAqAEHKEZVdGxbm4");

  it("Initializes the mint!", async () => {
    // Generate a new admin keypair to represent the authority of the mint
    const adminKeypair = Keypair.generate();

    // Create a deterministic public key for the mint account using `createWithSeed`
    const mintKey = await PublicKey.createWithSeed(
      adminKeypair.publicKey, // Base key (admin's public key)
      "golf_mellow", // Seed string for deriving the mint key
      programId // The program ID as the owner of the derived account
    );

    // Derive a PDA (Program Derived Address) for the mint account
    const [mintPda, mintBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("golf_mellow"), mintKey.toBuffer()], // PDA seeds: "golf_mellow" and mint public key
      programId // The program ID
    );

    // Airdrop 1 SOL to the provider's wallet to fund transactions
    await provider.connection.requestAirdrop(
      provider.wallet.publicKey, // Provider's wallet public key
      anchor.web3.LAMPORTS_PER_SOL // Amount in lamports (1 SOL)
    );

    // Call the `initMint` instruction to initialize the mint account
    const tx = await program.methods
      .initMint({
        name: "Golf Mellow Token", // Token name
        symbol: "GM Token", // Token symbol
        supply: new BN(600_000 * Math.pow(10, 9)), // Total supply (600 million tokens, 9 decimals)
        uri: "https://gateway.pinata.cloud/ipfs/bafkreic4y5l7oiglxx2g7hto5rdvsl32armtootuvwefjr5n5vbaigzta4", // Metadata URI
      })
      .accounts({
        mintAccount: mintPda, // Mint account PDA
        authority: adminKeypair.publicKey, // Authority for mint account
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID, // SPL Token program
        systemProgram: SystemProgram.programId, // Solana System program
      })
      .signers([adminKeypair]) // The admin keypair signs the transaction
      .rpc({ commitment: "confirmed" }); // Execute with "confirmed" commitment level

    console.log("Transaction signature for initMint:", tx); // Log the transaction signature
  });

  it("Mints tokens!", async () => {
    // Generate a new recipient keypair for the token account
    const toTokenAccount = Keypair.generate();

    // Derive the PDA for the mint proxy (tracks minting data)
    const [mintProxyPda, mintProxyBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("mint_pda"), toTokenAccount.publicKey.toBuffer()], // Seeds: "mint_pda" and recipient's public key
      programId // The program ID
    );

    // Airdrop 1 SOL to the recipient's wallet to fund transactions
    await provider.connection.requestAirdrop(
      toTokenAccount.publicKey, // Recipient's public key
      anchor.web3.LAMPORTS_PER_SOL // Amount in lamports (1 SOL)
    );

    // Call the `mintTokens` instruction to mint tokens to the recipient account
    const tx = await program.methods
      .mintTokens(new BN(1_000 * Math.pow(10, 9))) // Mint 1,000 tokens (1,000 * 10^9 for 9 decimals)
      .accounts({
        mint: mintProxyPda, // Mint proxy PDA
        to: toTokenAccount.publicKey, // Recipient's token account
        mintProxyPda: mintProxyPda, // Mint proxy PDA
        authority: provider.wallet.publicKey, // Authority (provider's wallet)
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID, // SPL Token program
      })
      .signers([toTokenAccount]) // Recipient keypair signs the transaction
      .rpc({ commitment: "confirmed" }); // Execute with "confirmed" commitment level

    console.log("Transaction signature for mintTokens:", tx); // Log the transaction signature
  });
});
