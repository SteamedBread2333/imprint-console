import { useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Card, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { embedBackfill, embedBackfillStatus, type EmbedBackfillResult, type Snapshot } from "../../platform/tauri/api";
import { StatusPill } from "../../components/StatusPill";
import type { Messages } from "../../i18n";

export type ServicePhase = "running" | "stopped" | "starting";

export function servicePhase(up: boolean, pending: boolean): ServicePhase {
  if (up) return "running";
  if (pending) return "starting";
  return "stopped";
}

type Props = {
  m: Messages;
  snap: Snapshot;
  hasProject: boolean;
  busy: boolean;
  hostUp: boolean;
  embedReady: boolean;
  onRefresh: () => void;
  onStack: (up: boolean) => void;
  pendingHost: boolean;
  pendingEmbed: boolean;
  onCancelJob: () => void;
  onOpenAudit: () => void;
  onRevealVault: () => void;
  onOpenEmbedWizard: () => void;
  onEmbedStart: () => void;
  onEmbedStop: () => void;
};

export function DashboardPage({
  m,
  snap,
  hasProject,
  busy,
  hostUp,
  embedReady,
  onRefresh,
  onStack,
  pendingHost,
  pendingEmbed,
  onCancelJob,
  onOpenAudit,
  onRevealVault,
  onOpenEmbedWizard,
  onEmbedStart,
  onEmbedStop,
}: Props) {
  const embedUp = snap.embed.running || snap.embedHealth?.ok === true;
  const embedPhase = servicePhase(embedUp, pendingEmbed);
  const [pending, setPending] = useState<EmbedBackfillResult | null>(null);
  const [pendingError, setPendingError] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState("");

  useEffect(() => {
    if (!hasProject) {
      setPending(null);
      setPendingError("");
      setBackfillNote("");
      return;
    }
    let cancelled = false;
    setPendingError("");
    embedBackfillStatus()
      .then((status) => {
        if (!cancelled) setPending(status);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPendingError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [hasProject, snap.vault]);

  const onBackfill = async () => {
    setBackfilling(true);
    setPendingError("");
    setBackfillNote("");
    try {
      const result = await embedBackfill();
      setBackfillNote(`${m.embedBackfillEncoded} ${result.encoded} · ${m.embedBackfillFailed} ${result.failed}`);
      setPending(await embedBackfillStatus());
    } catch (err: unknown) {
      setPendingError(String(err));
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={3}>{m.serviceOverview}</Title>
        <Group gap="xs">
          {busy && (
            <Button size="xs" variant="subtle" onClick={onCancelJob}>
              {m.cancelJob}
            </Button>
          )}
          <Button size="xs" variant="subtle" onClick={onRefresh} disabled={busy}>
            {m.refresh}
          </Button>
        </Group>
      </Group>

      <Stack gap="sm">
        <Group gap="xs">
          <Title order={4}>{m.scopeGlobal}</Title>
          <Badge variant="outline">Global</Badge>
        </Group>
        <Text size="sm" c="dimmed">{m.scopeGlobalHint}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ServiceCard
            title={m.embed}
            port={snap.embed.port}
            phase={embedPhase}
            m={m}
            extra={
              embedPhase === "starting"
                ? m.starting
                : embedReady
                  ? m.embedReady
                  : snap.embedHealth?.ok
                    ? m.embedUpNotReady
                    : snap.embed.running
                      ? m.embedUpWait
                      : snap.embed.error || m.embedDown
            }
            pills={
              <>
                {snap.embed.healthy && <StatusPill label="healthy" tone="ok" />}
                {embedReady && <StatusPill label="ready" tone="ok" />}
              </>
            }
            actions={
              <>
                <Button size="xs" disabled={busy} onClick={onEmbedStart}>{m.embedStart}</Button>
                <Button size="xs" variant="default" disabled={busy} onClick={onEmbedStop}>{m.embedStop}</Button>
                <Button size="xs" variant="subtle" onClick={onOpenEmbedWizard}>{m.embedWizardOpen}</Button>
              </>
            }
          />
        </SimpleGrid>
      </Stack>

      {hasProject && (
        <Stack gap="sm">
          <Group gap="xs">
            <Title order={4}>{m.scopeProject}</Title>
            <Badge variant="outline">Project</Badge>
          </Group>
          <Text size="sm" c="dimmed">{m.scopeProjectHint}</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ServiceCard
              title={m.host}
              port={snap.host.port}
              phase={servicePhase(snap.host.listening, pendingHost)}
              m={m}
              extra={`${m.rules} ${snap.host.rules ?? 0}`}
              actions={
                <>
                  <Button size="xs" disabled={busy} onClick={() => onStack(true)}>{m.stackUp}</Button>
                  <Button size="xs" variant="default" disabled={busy} onClick={() => onStack(false)}>{m.stackDown}</Button>
                </>
              }
            />
            <ServiceCard
              title={m.shelves}
              port={0}
              phase={servicePhase(snap.shelves.indexed, false)}
              m={m}
              extra={
                snap.shelves.enabled
                  ? `indexed: ${snap.shelves.indexed ? m.indexedYes : m.indexedNo} · roots: ${(snap.shelves.roots ?? []).join(", ") || "—"}`
                  : m.shelvesOff
              }
              actions={<Text size="xs" c="dimmed">{m.shelvesHint}</Text>}
            />
            <ServiceCard
              title={m.audit}
              port={0}
              phase={servicePhase(hostUp, false)}
              m={m}
              extra={hostUp ? m.auditReady : m.deskNeedHost}
              actions={
                <Button data-testid="open-audit" size="xs" variant="default" disabled={!hostUp} onClick={onOpenAudit}>
                  {m.openAudit}
                </Button>
              }
            />
            <EmbedBackfillCard
              m={m}
              ruleCount={snap.host.rules ?? 0}
              pending={pending}
              pendingError={pendingError}
              backfillNote={backfillNote}
              embedUp={embedUp}
              busy={busy}
              backfilling={backfilling}
              onBackfill={() => void onBackfill()}
            />
            <Card withBorder padding="md" radius="md">
              <Text fw={600} mb="sm">{m.vault}</Text>
              <Text size="sm" c="dimmed" ff="monospace" lineClamp={3} title={snap.vault}>
                {snap.vault || "—"}
              </Text>
              <Group mt="md">
                <Button size="xs" variant="subtle" disabled={!snap.vault} onClick={onRevealVault}>
                  {m.openInFinder}
                </Button>
              </Group>
            </Card>
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

function EmbedBackfillCard({
  m,
  ruleCount,
  pending,
  pendingError,
  backfillNote,
  embedUp,
  busy,
  backfilling,
  onBackfill,
}: {
  m: Messages;
  ruleCount: number;
  pending: EmbedBackfillResult | null;
  pendingError: string;
  backfillNote: string;
  embedUp: boolean;
  busy: boolean;
  backfilling: boolean;
  onBackfill: () => void;
}) {
  const loading = !pending && !pendingError;
  const off = pending?.no_embedder === true;
  const ready = pending != null && !off && pending.scanned === 0;
  const noRules = ready && ruleCount === 0;
  const allDone = ready && ruleCount > 0;
  const work = pending != null && !off && pending.scanned > 0;

  const statusBadge = loading
    ? { label: m.embedBackfillLoading, color: "gray" as const }
    : off
      ? { label: m.embedBackfillStatusOff, color: "gray" as const }
      : ready
        ? { label: m.embedBackfillStatusReady, color: "teal" as const }
        : { label: m.embedBackfillStatusPending, color: "violet" as const };

  const canRun =
    !busy && !backfilling && embedUp && work && !pendingError;

  return (
    <Card withBorder padding="md" radius="md" style={{ display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
        <Text fw={600}>{m.embedBackfill}</Text>
        <Badge variant="light" color={statusBadge.color} size="sm">
          {statusBadge.label}
        </Badge>
      </Group>

      <Paper withBorder p="md" radius="sm" mb="sm" style={{ minHeight: 88 }}>
        {loading && (
          <Text size="sm" c="dimmed">
            {m.embedBackfillLoading}
          </Text>
        )}
        {off && (
          <Text size="sm" c="dimmed">
            {m.embedBackfillOff}
          </Text>
        )}
        {noRules && (
          <Text size="sm" c="dimmed">{m.embedBackfillNoRules}</Text>
        )}
        {allDone && (
          <Stack gap={6}>
            <Text size="xl" fw={700} lh={1} c="teal">
              0
            </Text>
            <Text size="sm">{fillTemplate(m.embedBackfillAllDone, { n: ruleCount })}</Text>
            <Text size="xs" c="dimmed">{m.embedBackfillImportNote}</Text>
          </Stack>
        )}
        {work && (
          <Stack gap={4}>
            <Text size="xl" fw={700} lh={1}>
              {pending.scanned}
            </Text>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.04em" }}>
              {m.embedBackfillPending}
            </Text>
          </Stack>
        )}
      </Paper>

      {pendingError && (
        <Alert variant="light" color="red" p="xs" mb="sm">
          {pendingError}
        </Alert>
      )}
      {backfillNote && (
        <Alert variant="light" color="teal" p="xs" mb="sm">
          {backfillNote}
        </Alert>
      )}
      {!embedUp && work && (
        <Text size="xs" c="orange" mb="sm">
          {m.embedBackfillNeedSidecar}
        </Text>
      )}

      <Text size="xs" c="dimmed" mb="md" style={{ flex: 1 }}>
        {m.embedBackfillHint}
      </Text>

      <Group gap="xs" mt="auto">
        <Button
          size="sm"
          variant={canRun ? "filled" : "light"}
          color={canRun ? "violet" : "gray"}
          loading={backfilling}
          disabled={!canRun}
          onClick={onBackfill}
        >
          {m.embedBackfillAction}
        </Button>
      </Group>
    </Card>
  );
}

function ServiceCard({
  title,
  port,
  phase,
  extra,
  actions,
  pills,
  m,
}: {
  title: string;
  port: number;
  phase: ServicePhase;
  extra: string;
  actions: ReactNode;
  pills?: ReactNode;
  m: Messages;
}) {
  const label = phase === "running" ? m.running : phase === "starting" ? m.starting : m.stopped;
  const color = phase === "running" ? "teal" : phase === "starting" ? "yellow" : "gray";
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{title}</Text>
        {port > 0 && <Text size="xs" c="dimmed" ff="monospace">{port}</Text>}
      </Group>
      <Badge variant="dot" color={color} size="sm">{label}</Badge>
      {pills && <Group gap={6} mt="xs">{pills}</Group>}
      <Text size="sm" c="dimmed" mt="sm" style={{ minHeight: 40 }}>{extra}</Text>
      <Group mt="md" gap="xs">{actions}</Group>
    </Card>
  );
}
