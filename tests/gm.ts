import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gm } from "../target/types/gm";
import { PublicKey, SystemProgram } from "@solana/web3.js";

describe("gm", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Gm as Program<Gm>;

  it("Initializes the mint!", async () => {
    const [mintPda, mintBump] = await PublicKey.findProgramAddress(
      [Buffer.from("golf_mellow"), mintKey.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .initMint({
        name: "Test Token",
        symbol: "TTK",
        supply: 1000000,
        uri: "https://gateway.pinata.cloud/ipfs/bafkreic4y5l7oiglxx2g7hto5rdvsl32armtootuvwefjr5n5vbaigzta4",
      })
      .accounts({
        mint: mintPda,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Mint initialized with transaction signature", tx);
  });

  it("Mints tokens!", async () => {
    const tx = await program.methods
      .mintTokens(1000)
      .accounts({
        mint: mintPda,
        to: toTokenAccount,
        mintProxyPda: mintProxyPda,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Tokens minted with transaction signature", tx);
  });

  it("Burns tokens!", async () => {
    const tx = await program.methods
      .burnTokens(500)
      .accounts({
        mint: mintPda,
        from: fromTokenAccount,
        burnProxyPda: burnProxyPda,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Tokens burned with transaction signature", tx);
  });

  it("Transfers tokens!", async () => {
    const tx = await program.methods
      .transferTokens(200)
      .accounts({
        from: fromTokenAccount,
        to: toTokenAccount,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Tokens transferred with transaction signature", tx);
  });
});
