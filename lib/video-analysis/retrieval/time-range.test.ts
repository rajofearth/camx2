import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTimeRangeFromQuestion,
  parseTimeRangeInput,
  parseTimestampToMs,
} from "./time-range";

test("parseTimestampToMs handles mm:ss and hh:mm:ss", () => {
  assert.equal(parseTimestampToMs("00:05"), 5_000);
  assert.equal(parseTimestampToMs("01:02:03"), 3_723_000);
  assert.equal(parseTimestampToMs("01:02.5"), 62_500);
});

test("parseTimeRangeInput rejects reversed ranges", () => {
  assert.throws(
    () => parseTimeRangeInput({ start: "00:05", end: "00:01" }),
    /greater than or equal to start/,
  );
});

test("extractTimeRangeFromQuestion finds inline ranges", () => {
  assert.deepEqual(extractTimeRangeFromQuestion("check 00:01-00:05 please"), {
    startMs: 1_000,
    endMs: 5_000,
  });
  assert.equal(extractTimeRangeFromQuestion("no range here"), null);
});
