/**
 * The nav's two spellings of the same thing.
 *
 * The id is what the CLI takes and what the store calls the thing on disk; the sentence
 * is what a column of forty of them is like to scan. The cases worth pinning are the ones
 * where the rule has to decide something: a word the store capitalised, a path, and an id
 * that is one word already.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { displayName, sentenceCase } from "../src/names.js";

describe("sentenceCase", () => {
  it("spends the hyphens on spaces and capitalises the first word", () => {
    assert.equal(
      sentenceCase("verify-figma-annotation-implementation"),
      "Verify figma annotation implementation",
    );
    assert.equal(
      sentenceCase("add-lot-user-bid-history"),
      "Add lot user bid history",
    );
  });

  it("leaves a one-word id as the one word, capitalised", () => {
    assert.equal(sentenceCase("localization"), "Localization");
  });

  it("keeps the digits inside a word", () => {
    assert.equal(sentenceCase("tier1-support"), "Tier1 support");
  });

  // Lowercasing the rest would flatten a word the store deliberately capitalised, and
  // uppercasing anything would be guessing at which of ui, zzz and sc are acronyms.
  it("changes no letter but the first", () => {
    assert.equal(sentenceCase("add-PRD-links"), "Add PRD links");
    assert.equal(sentenceCase("ui"), "Ui");
  });

  it("underscores count as word breaks too", () => {
    assert.equal(sentenceCase("auction_listing_page"), "Auction listing page");
  });

  it("has nothing to do with an empty id", () => {
    assert.equal(sentenceCase(""), "");
    assert.equal(sentenceCase("-"), "-");
  });
});

describe("displayName", () => {
  it("is the id itself when plain names are off", () => {
    assert.equal(
      displayName("add-account-profile", false),
      "add-account-profile",
    );
  });

  // A namespace row names a path, and the level it names is in the separators.
  it("takes a path segment by segment", () => {
    assert.equal(displayName("zzz-site/site", true), "Zzz site/Site");
  });

  // `ui` and `zzz` are an acronym and a product code; "Ui" reads as a typo.
  it("sets a segment of three letters or fewer in capitals", () => {
    assert.equal(displayName("shared/ui", true), "Shared/UI");
    assert.equal(
      displayName("ui/component-package", true),
      "UI/Component package",
    );
  });

  // The same rule inside a name would give "ADD lot user BID history": a short word in a
  // sentence is the one thing that is never an acronym.
  it("stops that rule at the segment", () => {
    assert.equal(
      displayName("add-lot-user-bid-history", true),
      "Add lot user bid history",
    );
  });

  it("reads a change id as a sentence", () => {
    assert.equal(
      displayName("split-figma-annotation-reconciliation", true),
      "Split figma annotation reconciliation",
    );
  });
});
