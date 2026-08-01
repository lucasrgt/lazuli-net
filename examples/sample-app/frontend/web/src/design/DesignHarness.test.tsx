import { render } from "@testing-library/react";
import { collectDocument, loadContract, verifyEvidence } from "assay-design";
import { describe, expect, it, vi } from "vitest";
import { Button, Card, Field, Input, Screen, Stack, Text } from "../ui";

describe("sample UI kit design contract", () => {
  it("conforms through the shared AVP design verdict", async () => {
    render(
      <Screen>
        <Stack>
          <Text role="title">Design system</Text>
          <Card>
            <Field fieldId="name" label="Name">
              <Input id="name" value="" onChangeText={vi.fn()} invalid />
            </Field>
            <Button label="Create project" onPress={vi.fn()} loading />
          </Card>
        </Stack>
      </Screen>,
    );

    const contract = await loadContract("../.design/contract.toml");
    const evidence = collectDocument(document, "sample-ui-kit", {
      states: ["default", "invalid", "loading"],
      themes: ["light", "dark"],
      viewports: ["compact", "regular", "wide"],
      locales: ["en", "pt-BR"],
    });
    const verdict = await verifyEvidence(contract, evidence);

    expect(verdict.results.filter((result) => result.status !== "pass")).toEqual([]);
    expect(verdict.outcome).toBe("pass");
  });
});
