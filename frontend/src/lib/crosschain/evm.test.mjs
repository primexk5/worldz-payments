import assert from "node:assert/strict";
import test from "node:test";

import { erc20TransferCalldata } from "./evm.ts";

test("erc-20 transfer calldata encodes selector, address and amount", () => {
  const calldata = erc20TransferCalldata("0xDE00000000000000000000000000000000000001", 1050000n);
  assert.equal(calldata.length, 138);
  assert.equal(calldata.slice(0, 10), "0xa9059cbb");
  assert.equal(calldata.slice(10, 50), "000000000000000000000000de00000000000000");
  assert.equal(BigInt(`0x${calldata.slice(74)}`), 1050000n);
});

test("erc-20 transfer calldata rejects malformed addresses", () => {
  assert.throws(() => erc20TransferCalldata("not-an-address", 1n), /not a valid EVM address/);
});
