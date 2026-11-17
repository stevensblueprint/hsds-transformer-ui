import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import sourceText from "../assets/repository-json/orgs.json?raw";
import mappingText from "../assets/repository-json/orgs_organization_mapping.json?raw";
import MappingReview from "./MappingReview";
import { parseMappings } from "./mapping";
import type { Decision, InputFile } from "./model";
const source: InputFile = {
  name: "orgs.json",
  file: new File([sourceText], "orgs.json"),
  text: sourceText,
};
const doc = parseMappings(
  [
    {
      name: "orgs_organization_mapping.json",
      file: new File([mappingText], "orgs_organization_mapping.json"),
      text: mappingText,
    },
  ],
  "json",
)[0];
function Harness({
  onSave = vi.fn(),
  onDecision = vi.fn(),
}: {
  onSave?: (
    filename: string,
    text: string,
    reason?: string,
  ) => void | boolean | Promise<boolean>;
  onDecision?: (id: string, decision: Decision) => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  return (
    <MappingReview
      documents={[doc]}
      sources={[source]}
      decisions={decisions}
      disabled={false}
      onDecision={(id, decision) => {
        setDecisions((old) => ({ ...old, [id]: decision }));
        onDecision(id, decision);
      }}
      onSave={onSave}
    />
  );
}
const nameRow = () =>
  screen.getByRole("article", {
    name: "Review Name in orgs_organization_mapping.json, row 2 mapping",
  });
async function openName() {
  const user = userEvent.setup();
  await user.click(nameRow().querySelector("summary")!);
  return { user, row: within(nameRow()) };
}

describe("mapping decisions and corrections", () => {
  it("clarification stays unresolved, then pending after an answer until explicitly approved", async () => {
    const decision = vi.fn();
    render(<Harness onDecision={decision} />);
    const { user, row } = await openName();
    await user.click(row.getByRole("button", { name: /^Question about Name/ }));
    await user.type(
      row.getByLabelText("Question for review"),
      "Is this the public organization name?",
    );
    await user.click(row.getByRole("button", { name: "Save review question" }));
    expect(decision).toHaveBeenLastCalledWith(doc.rows[1].id, "unresolved");
    expect(row.getByRole("button", { name: /^Approve Name/ })).toBeDisabled();
    await user.click(
      row.getByRole("button", { name: /^Answer question about Name/ }),
    );
    await user.type(
      row.getByLabelText("Answer from review"),
      "Confirmed with source owner.",
    );
    await user.click(row.getByRole("button", { name: "Save review answer" }));
    expect(decision).toHaveBeenLastCalledWith(doc.rows[1].id, "pending");
    await user.click(row.getByRole("button", { name: /^Approve Name/ }));
    expect(decision).toHaveBeenLastCalledWith(doc.rows[1].id, "approved");
  });
  it("rejection leaves the source/mapping unchanged, and cancelling an edit restores focus", async () => {
    const save = vi.fn();
    render(<Harness onSave={save} />);
    const { user, row } = await openName();
    await user.click(row.getByRole("button", { name: /^Reject Name/ }));
    expect(row.getByText("Rejected", { exact: true })).toBeVisible();
    await user.click(row.getByRole("button", { name: /^Edit Name/ }));
    expect(row.getByLabelText("Source field(s)")).toHaveFocus();
    await user.clear(row.getByLabelText("Target path within organization"));
    await user.type(
      row.getByLabelText("Target path within organization"),
      "description",
    );
    await user.click(row.getByRole("button", { name: "Cancel editing" }));
    expect(row.getByRole("button", { name: /^Edit Name/ })).toHaveFocus();
    expect(row.getByText("Rejected", { exact: true })).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    expect(doc.text).toBe(mappingText);
    expect(source.text).toBe(sourceText);
  });
  it("requires a reason, shows before/after/scope, and retains the draft when the parent cannot rebuild", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<Harness onSave={save} />);
    const { user, row } = await openName();
    await user.click(row.getByRole("button", { name: /^Edit Name/ }));
    await user.clear(row.getByLabelText("Target path within organization"));
    await user.type(
      row.getByLabelText("Target path within organization"),
      "description",
    );
    expect(row.getByText("Before", { exact: true })).toBeVisible();
    expect(row.getByText("After", { exact: true })).toBeVisible();
    expect(row.getByText("Affected scope", { exact: true })).toBeVisible();
    // Submit through the public form to exercise the application validation as well as required labels.
    fireEvent.submit(row.getByRole("form", { name: /^Edit Name/ }));
    expect(save).not.toHaveBeenCalled();
    expect(row.getByRole("alert")).toHaveTextContent("reason");
    await user.type(
      row.getByLabelText("Reason for change"),
      "Use the reviewed description destination.",
    );
    await user.click(row.getByRole("button", { name: "Save mapping change" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toBe(doc.filename);
    expect(JSON.parse(save.mock.calls[0][1]).mappings[1].output_path).toBe(
      "description",
    );
    expect(save.mock.calls[0][2]).toBe(
      "Use the reviewed description destination.",
    );
    await waitFor(() =>
      expect(row.getByRole("alert")).toHaveTextContent("could not be saved"),
    );
    expect(row.getByLabelText("Target path within organization")).toHaveValue(
      "description",
    );
  });
  it("validates advanced edits and preserves unsaved invalid text for correction", async () => {
    const save = vi.fn();
    render(<Harness onSave={save} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByText("Advanced mapping file", { exact: true }),
    );
    await user.click(screen.getByRole("button", { name: "Edit mapping file" }));
    await user.clear(screen.getByLabelText("Mapping file contents"));
    await user.type(screen.getByLabelText("Mapping file contents"), "invalid");
    await user.type(
      screen.getByLabelText("Reason for file change"),
      "Correct mapping instructions.",
    );
    await user.click(screen.getByRole("button", { name: "Save mapping file" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("Mapping file contents")).toHaveValue(
      "invalid",
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel file editing" }),
    );
    expect(
      screen.getByRole("button", { name: "Edit mapping file" }),
    ).toHaveFocus();
  });
});
