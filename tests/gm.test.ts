const anchor = require("@coral-xyz/anchor");
const { Program, Idl, AnchorProvider, setProvider } = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Keypair } = require("@solana/web3.js");
const BN = require("bn.js");
const { useAnchorWallet, useConnection } = require("@solana/wallet-adapter-react");

const { connection } = useConnection();
const wallet = useAnchorWallet();

describe("golf_mellow_program_instructions", () => {

  // Initialize the Anchor provider for local testing
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Import the program using Anchor's workspace abstraction
  const program = anchor.workspace.GolfMellowSpl as Program;

  // Set the program ID explicitly (matches the deployed program ID)
  const programId = new PublicKey("8LytJusdgxnfPBJZFBGMnvqQLY2ybAqAEHKEZVdGxbm4");

  it("Initializes the mint!", async () => {
    // Generate a new admin keypair to represent the authority of the mint
    const adminKeypair = Keypair.generate();

    console.log("Admin public key:", adminKeypair.publicKey.toBase58());
    console.log("Admin secret key:", adminKeypair.secretKey);

    // Create a deterministic public key for the mint account using `createWithSeed`
    const mintKey = await PublicKey.createWithSeed(
      adminKeypair.publicKey,
      "golf_mellow",
      programId
    );

    // Derive a PDA (Program Derived Address) for the mint account
    const [mintPda, mintBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("golf_mellow"), mintKey.toBuffer()],
      programId
    );

    // Airdrop 1 SOL to the provider's wallet to fund transactions
    await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );

    // Call the `initMint` instruction to initialize the mint account
    const tx = await program.methods
      .initMint({
        name: "Golf Mellow Token",
        symbol: "GM Token",
        supply: new BN(600_000 * Math.pow(10, 9)),
        uri: "https://gateway.pinata.cloud/ipfs/bafkreic4y5l7oiglxx2g7hto5rdvsl32armtootuvwefjr5n5vbaigzta4",
      })
      .accounts({
        mintAccount: mintPda,
        authority: adminKeypair.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature for initMint:", tx);
  });

  it("Mints tokens!", async () => {
    // Generate a new recipient keypair for the token account
    const toTokenAccount = Keypair.generate();

    // Derive the PDA for the mint proxy (tracks minting data)
    const [mintProxyPda, mintProxyBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("mint_pda"), toTokenAccount.publicKey.toBuffer()],
      programId
    );

    // Airdrop 1 SOL to the recipient's wallet to fund transactions
    await provider.connection.requestAirdrop(
      toTokenAccount.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );

    // Call the `mintTokens` instruction to mint tokens to the recipient account
    const tx = await program.methods
      .mintTokens(new BN(1_000 * Math.pow(10, 9)))
      .accounts({
        mint: mintProxyPda,
        to: toTokenAccount.publicKey,
        mintProxyPda: mintProxyPda,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([toTokenAccount])
      .rpc({ commitment: "confirmed" });

    console.log("Transaction signature for mintTokens:", tx);
  });
});
