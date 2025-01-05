import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GolfMellowSpl } from "../target/types/golf_mellow_spl";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";


describe("golf_mellow_spl", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.GolfMellowSpl as Program<GolfMellowSpl>;

  const mintKeypair = Keypair.generate();
  const mintProxyKeypair = Keypair.generate();

  const splMintParams = {
    name: "Golf Mellow Token",
    symbol: "GM Token",
    supply: new BN(600_000 * Math.pow(10, 9)),
    uri: "https://gateway.pinata.cloud/ipfs/bafkreic4y5l7oiglxx2g7hto5rdvsl32armtootuvwefjr5n5vbaigzta4",
  };

  let mint: PublicKey;

  before(async () => {
    // Airdrop SOL for transaction fees
    await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );

    // Derive PDA for the mint account
    [mint] = PublicKey.findProgramAddressSync(
      [Buffer.from("golf_mellow"), mintKeypair.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Initializes the mint account", async () => {
    const tx = await program.methods
      .initMint({
        name: splMintParams.name,
        symbol: splMintParams.symbol,
        supply: splMintParams.supply,
        uri: splMintParams.uri,
      })
      .accounts({
        mint: mint,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([mintKeypair])
      .rpc({ commitment: "confirmed" });

    console.log("Mint initialized:", mint.toBase58());
    console.log(`Transaction: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  });

  it("Mints tokens to a token account", async () => {
    const toKeypair = Keypair.generate();
    const amount = new BN(15_000 * Math.pow(10, 9)); // Max per transaction

    await program.methods
      .mintTokens(amount)
      .accounts({
        mint: mint,
        to: toKeypair.publicKey,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([toKeypair])
      .rpc({ commitment: "confirmed" });

    const mintAccount = await program.account.mintProxyPda.fetch(mint);
    assert.strictEqual(mintAccount.mintTotal.toString(), amount.toString());
  });

  it("Burns tokens from a token account", async () => {
    const fromKeypair = Keypair.generate();
    const burnAmount = new BN(5_000 * Math.pow(10, 9));

    await program.methods
      .burnTokens(burnAmount)
      .accounts({
        mint: mint,
        from: fromKeypair.publicKey,
        authority: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([fromKeypair])
      .rpc({ commitment: "confirmed" });

    const burnAccount = await program.account.burnProxyPda.fetch(mint);
    assert.strictEqual(burnAccount.burnTotal.toString(), burnAmount.toString());
  });

  it("Stores a Polygon address in the PDA", async () => {
    const polygonAddress = "0x1234567890abcdef1234567890abcdef12345678";

    await program.methods
      .storePolygonAddress(polygonAddress)
      .accounts({
        mint: mint,
        authority: provider.wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    const polygonPDA = await program.account.polygonAddressPda.fetch(mint);
    assert.strictEqual(polygonPDA.polygonAddress, polygonAddress);
  });
});