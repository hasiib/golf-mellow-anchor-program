import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

describe("Golf Mellow SPL PDA Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.GolfMellowSpl;
  const adminKeypair = anchor.web3.Keypair.generate();
  const InitMintSeed = "InitMint";
  const InitializePDASeed = "InitializePDA";

  // for remaining instructions
  const clientKeypair = anchor.web3.Keypair.generate();
  const MintTokensSeed = "MintTokens";

  let mintPDA: PublicKey;
  let initProxyPDA: PublicKey;

  async function derivePDA(
    seed: string,
    publicKey: PublicKey
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(seed), publicKey.toBuffer()],
      program.programId
    );
  }

  async function isAccountInitialized(publicKey: PublicKey): Promise<boolean> {
    const accountInfo = await provider.connection.getAccountInfo(publicKey);
    return accountInfo !== null;
  }

  it("Initialize Mint with PDA", async () => {
    const mintParams = {
      name: "Golf Mellow Token",
      symbol: "GMT",
      supply: new BN(600_000 * Math.pow(10, 9)),
      uri: "https://gateway.pinata.cloud/ipfs/bafkreic4y5l7oiglxx2g7hto5rdvsl32armtootuvwefjr5n5vbaigzta4",
    };

    [mintPDA] = await derivePDA(InitMintSeed, adminKeypair.publicKey);

    if (!(await isAccountInitialized(mintPDA))) {
      console.log("Mint account not initialized. Initializing...");

      const balance = await provider.connection.getBalance(
        adminKeypair.publicKey
      );
      if (balance < 2e9) {
        console.log("Airdropping SOL to admin wallet...");
        const airdropSignature = await provider.connection.requestAirdrop(
          adminKeypair.publicKey,
          2e9
        );

        const latestBlockhash = await provider.connection.getLatestBlockhash();
        await provider.connection.confirmTransaction(
          {
            signature: airdropSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );

        console.log("Airdrop completed.");
      }

      console.log("Mint PDA:", mintPDA.toBase58());

      const tx = await program.methods
        .initMint(mintParams)
        .accounts({
          mint: mintPDA,
          authority: adminKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([adminKeypair])
        .rpc();

      console.log("Transaction signature:", tx);
    } else {
      console.log("Mint account already initialized. Skipping initialization.");
    }
  });

  it("Initialize PDA", async () => {
    const polygonAddress = "0x1234567890abcdef1234567890abcdef12345678";
    [initProxyPDA] = await derivePDA(InitializePDASeed, mintPDA);

    if (!(await isAccountInitialized(initProxyPDA))) {
      console.log("Proxy PDA not initialized. Initializing...");

      const tx = await program.methods
        .initializePda({ polygonAddress })
        .accounts({
          mintAccount: mintPDA,
          initProxyPda: initProxyPDA,
          authority: adminKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();

      console.log("PDA initialized successfully. Transaction:", tx);
    } else {
      console.log("Proxy PDA already initialized. Skipping initialization.");
    }
  });

  it("Mint Tokens Using PDA", async () => {
    const recipientTokenAccount = await anchor.utils.token.associatedAddress({
      mint: mintPDA,
      owner: adminKeypair.publicKey,
    });

    const [mintProxyPDA] = await derivePDA("MintTokens", mintPDA);

    const tx = await program.methods
      .mintTokens(new BN(1_000 * Math.pow(10, 9)))
      .accounts({
        mint: mintPDA,
        destination: await anchor.utils.token.associatedAddress({
          mint: mintPDA,
          owner: adminKeypair.publicKey,
        }),
        mintProxyPda: mintProxyPDA,
        authority: adminKeypair.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([adminKeypair])
      .rpc();

    console.log("Tokens minted successfully. Transaction:", tx);
  });
});
