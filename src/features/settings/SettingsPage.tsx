import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  type AppConfig,
  type GlobalEmbedDoc,
  type RuntimeStatus,
  getGlobalEmbed,
  saveGlobalEmbed,
} from "../../platform/tauri/api";
import type { Locale, Messages } from "../../i18n";

type EmbedForm = {
  enabled: boolean;
  package: string;
  port: string;
  duplicateThreshold: string;
  relateContradictionMin: string;
  relateEntailmentMin: string;
  relateBidirectional: boolean;
  relateEnabled: boolean;
  timeoutSeconds: string;
};

/** Operational knobs. Model ids stay in the sidecar plugin schema. */
const EMBED_DEFAULTS = {
  port: 4174,
  duplicateThreshold: 0.65,
  relateContradictionMin: 0.4,
  relateEntailmentMin: 0.35,
  relateBidirectional: true,
  timeoutSeconds: 5,
};

function relateEnabledFrom(raw: unknown): boolean {
  if (typeof raw !== "string") return true;
  const v = raw.trim().toLowerCase();
  return v !== "" && v !== "off" && v !== "none" && v !== "false" && v !== "0";
}

function numField(v: unknown, fallback: number): string {
  const n =
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
        ? Number(v)
        : null;
  if (n == null) return String(fallback);
  return String(Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
}

function embedFormFromDoc(doc: GlobalEmbedDoc): EmbedForm {
  const c = doc.config ?? {};
  return {
    enabled: doc.enabled,
    package: doc.package,
    port: numField(c.port, EMBED_DEFAULTS.port),
    duplicateThreshold: numField(c.duplicate_threshold, EMBED_DEFAULTS.duplicateThreshold),
    relateContradictionMin: numField(c.relate_contradiction_min, EMBED_DEFAULTS.relateContradictionMin),
    relateEntailmentMin: numField(c.relate_entailment_min, EMBED_DEFAULTS.relateEntailmentMin),
    relateBidirectional:
      typeof c.relate_bidirectional === "boolean"
        ? c.relate_bidirectional
        : EMBED_DEFAULTS.relateBidirectional,
    relateEnabled: relateEnabledFrom(c.relate_model),
    timeoutSeconds: numField(c.timeout_seconds, EMBED_DEFAULTS.timeoutSeconds),
  };
}

function parseIntInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function parseUnitInterval(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function embedFormError(form: EmbedForm): "port" | "threshold" | "timeout" | null {
  if (parseIntInRange(form.port, 1, 65535) == null) return "port";
  if (
    parseUnitInterval(form.duplicateThreshold) == null ||
    parseUnitInterval(form.relateContradictionMin) == null ||
    parseUnitInterval(form.relateEntailmentMin) == null
  ) return "threshold";
  if (parseIntInRange(form.timeoutSeconds, 1, 3600) == null) return "timeout";
  return null;
}

function embedDocFromForm(base: GlobalEmbedDoc, form: EmbedForm): GlobalEmbedDoc {
  const config: GlobalEmbedDoc["config"] = {
    ...base.config,
    port: parseIntInRange(form.port, 1, 65535),
    duplicate_threshold: parseUnitInterval(form.duplicateThreshold),
    relate_contradiction_min: parseUnitInterval(form.relateContradictionMin),
    relate_entailment_min: parseUnitInterval(form.relateEntailmentMin),
    relate_bidirectional: form.relateBidirectional,
    timeout_seconds: parseIntInRange(form.timeoutSeconds, 1, 3600),
  };
  delete config.model;
  if (form.relateEnabled) {
    delete config.relate_model;
  } else {
    config.relate_model = "off";
  }
  return {
    ...base,
    enabled: form.enabled,
    package: base.package,
    config,
  };
}

export function SettingsPage({
  m,
  cfg,
  locale,
  runtimeStatus,
  busy,
  onEnsureRuntime,
  onUpdateComponent,
  onSave,
  onRefreshRuntime,
  onEmbedSaved,
  runtimeLogLines,
}: {
  m: Messages;
  cfg: AppConfig;
  locale: Locale;
  runtimeStatus: RuntimeStatus | null;
  busy: boolean;
  onEnsureRuntime: () => void;
  onUpdateComponent: (name: string) => void;
  onSave: (c: AppConfig) => Promise<void>;
  onRefreshRuntime: () => void;
  onEmbedSaved: (message: string) => void;
  runtimeLogLines: string[];
}) {
  const [draft, setDraft] = useState(cfg);
  const [embedDoc, setEmbedDoc] = useState<GlobalEmbedDoc | null>(null);
  const [embedForm, setEmbedForm] = useState<EmbedForm | null>(null);
  const [embedError, setEmbedError] = useState("");
  useEffect(() => setDraft(cfg), [cfg]);
  useEffect(() => {
    let cancelled = false;
    getGlobalEmbed().then((doc) => {
      if (!cancelled) {
        setEmbedDoc(doc);
        setEmbedForm(embedFormFromDoc(doc));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [runtimeStatus?.ready]);

  const saveEmbed = async () => {
    if (!embedForm || !embedDoc) return;
    const invalid = embedFormError(embedForm);
    if (invalid) {
      setEmbedError({
        port: m.embedInvalidPort,
        threshold: m.embedInvalidThreshold,
        timeout: m.embedInvalidTimeout,
      }[invalid]);
      return;
    }
    try {
      const next = embedDocFromForm(embedDoc, embedForm);
      await saveGlobalEmbed(next);
      setEmbedDoc(next);
      setEmbedForm(embedFormFromDoc(next));
      setEmbedError("");
      onEmbedSaved(m.embedSaved);
      onRefreshRuntime();
    } catch (e) {
      setEmbedError(String(e));
    }
  };

  const monoInput = { input: { fontFamily: "var(--mantine-font-family-monospace)" } };
  const numberValue = (value: string) => value === "" ? "" : value;

  const embedPath = runtimeStatus?.globalEmbedPath?.trim();

  return (
    <Stack gap="lg" maw={760}>
      <Title order={3}>{m.settings}</Title>

      <Card withBorder padding="lg" radius="md">
        <Stack gap={4} mb="md">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Text fw={600}>{m.runtimeTitle}</Text>
            <Badge variant="dot" color={runtimeStatus?.ready ? "teal" : "gray"} size="sm">
              {runtimeStatus?.ready ? m.runtimeReady : m.runtimeNotReady}
            </Badge>
          </Group>
        </Stack>
        <Group mb="md">
          <Button size="xs" disabled={busy} onClick={onEnsureRuntime}>{m.runtimeEnsure}</Button>
          <Button size="xs" variant="subtle" disabled={busy} onClick={onRefreshRuntime}>{m.refresh}</Button>
        </Group>
        {(busy || runtimeLogLines.length > 0) && (
          <Paper withBorder p="xs" radius="sm" mb="md" bg="var(--mantine-color-body)">
            <ScrollArea h={120}>
              <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {runtimeLogLines.length > 0 ? runtimeLogLines.join("\n") : m.runtimeUpdating}
              </Text>
            </ScrollArea>
          </Paper>
        )}
        <Stack gap="sm">
          {runtimeStatus?.components.map((c) => (
            <Paper key={c.name} withBorder p="sm" radius="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <Text size="sm" fw={600}>{c.name}</Text>
                    <Text size="xs" c="dimmed">
                      {c.installed
                        ? c.latest && c.version && c.latest !== c.version
                          ? `${c.version} → ${c.latest}`
                          : c.version || "ok"
                        : c.latest
                          ? `— → ${c.latest}`
                          : "—"}
                    </Text>
                  </Group>
                  <Text size="xs" ff="monospace" c="dimmed" style={{ wordBreak: "break-all" }}>
                    {c.path || "—"}
                  </Text>
                </Stack>
                {c.managedByConsole === true && (c.installed || c.name === "imprint") && (
                  <Button
                    size="compact-sm"
                    variant="light"
                    disabled={busy}
                    style={{ flexShrink: 0, alignSelf: "center" }}
                    onClick={() => onUpdateComponent(c.name)}
                  >
                    {m.runtimeUpdate}
                  </Button>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap" gap="sm">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600}>{m.globalEmbedTitle}</Text>
            <Text size="sm" c="dimmed">{m.globalEmbedHint}</Text>
            {embedPath && (
              <Stack gap={2} mt={4}>
                <Text size="xs" c="dimmed">{m.embedConfigPath}</Text>
                <Text size="xs" ff="monospace" c="dimmed" style={{ wordBreak: "break-all" }}>
                  {embedPath}
                </Text>
              </Stack>
            )}
          </Stack>
          {embedForm && (
            <Badge variant="light" color={embedForm.enabled ? "violet" : "gray"} size="lg">
              {embedForm.enabled ? m.embedStatusOn : m.embedStatusOff}
            </Badge>
          )}
        </Group>

        {embedForm && (
          <Stack gap="lg">
            <Switch
              label={m.globalEmbedEnabled}
              size="md"
              checked={embedForm.enabled}
              onChange={(e) => setEmbedForm({ ...embedForm, enabled: e.currentTarget.checked })}
            />

            <Divider label={m.embedSectionService} labelPosition="left" />

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <NumberInput
                label={m.embedPort}
                min={1}
                max={65535}
                value={embedForm.port}
                onChange={(v) => setEmbedForm({ ...embedForm, port: numberValue(String(v)) })}
              />
              <NumberInput
                label={m.embedTimeout}
                min={1}
                max={3600}
                value={embedForm.timeoutSeconds}
                onChange={(v) => setEmbedForm({ ...embedForm, timeoutSeconds: numberValue(String(v)) })}
              />
            </SimpleGrid>
            {embedForm.package.trim() !== "" && (
              <Text size="sm">
                <Text span c="dimmed" size="xs">
                  package ·{" "}
                </Text>
                <Text span ff="monospace" size="sm">
                  {embedForm.package}
                </Text>
              </Text>
            )}

            <Divider label={m.embedSectionThresholds} labelPosition="left" />

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <NumberInput
                label={m.embedDuplicate}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
                value={embedForm.duplicateThreshold}
                onChange={(v) => setEmbedForm({ ...embedForm, duplicateThreshold: numberValue(String(v)) })}
              />
              <NumberInput
                label={m.embedContradiction}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
                value={embedForm.relateContradictionMin}
                onChange={(v) => setEmbedForm({ ...embedForm, relateContradictionMin: numberValue(String(v)) })}
              />
              <NumberInput
                label={m.embedEntailment}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
                value={embedForm.relateEntailmentMin}
                onChange={(v) => setEmbedForm({ ...embedForm, relateEntailmentMin: numberValue(String(v)) })}
              />
            </SimpleGrid>

            <Divider label={m.embedSectionRelate} labelPosition="left" />

            <Paper withBorder p="md" radius="sm">
              <Stack gap="md">
                <Switch
                  label={m.embedRelate}
                  description={m.embedRelateHint}
                  checked={embedForm.relateEnabled}
                  onChange={(e) => setEmbedForm({ ...embedForm, relateEnabled: e.currentTarget.checked })}
                />
                <Switch
                  label={m.embedBidirectional}
                  checked={embedForm.relateBidirectional}
                  disabled={!embedForm.relateEnabled}
                  onChange={(e) => setEmbedForm({ ...embedForm, relateBidirectional: e.currentTarget.checked })}
                />
              </Stack>
            </Paper>

            {embedError && <Alert variant="light" color="red">{embedError}</Alert>}

            <Group justify="flex-end">
              <Button onClick={() => void saveEmbed()}>{m.save}</Button>
            </Group>
          </Stack>
        )}
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Text fw={600} mb="md">{m.settings}</Text>
        <Stack gap="md">
          <TextInput
            label={m.imprintBin}
            description={m.imprintBinHint}
            value={draft.imprintBin}
            styles={monoInput}
            placeholder="imprint 或绝对路径"
            onChange={(e) => setDraft({ ...draft, imprintBin: e.currentTarget.value })}
          />
          <NumberInput
            label={m.pollMs}
            value={draft.pollIntervalMs}
            min={500}
            onChange={(v) => setDraft({ ...draft, pollIntervalMs: typeof v === "number" ? v : Number(v) || 2500 })}
          />
          <TextInput
            label={m.hfEndpoint}
            value={draft.hfEndpoint}
            placeholder="https://hf-mirror.com"
            onChange={(e) => setDraft({ ...draft, hfEndpoint: e.currentTarget.value })}
          />
          <TextInput
            label={m.imprintHf}
            value={draft.imprintHfEndpoint}
            onChange={(e) => setDraft({ ...draft, imprintHfEndpoint: e.currentTarget.value })}
          />
          <Group justify="flex-end">
            <Button onClick={() => onSave({ ...draft, locale })}>{m.save}</Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
