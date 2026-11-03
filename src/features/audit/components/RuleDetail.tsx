import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Code, Drawer, Group, Loader, ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";
import type { Messages } from "../../../i18n";
import { deskClient } from "../api/desk-client";
import type { DocFile, GraphNode } from "../domain/contracts";
import { ruleStatusBadgeColor, scopeColor } from "../domain/graph-model";
import {
  headingSection,
  highlightTerms,
  renderDocBody,
  renderSafeMarkdown,
  runMermaidInElement,
  scrollDocAnchorIntoView,
} from "../domain/markdown";

type Source = {
  path?: string;
  heading?: string;
  snippet?: string;
  line_start?: number;
  line_end?: number;
};

function deskFailure(error: unknown): { text: string; notFound: boolean } {
  if (typeof error === "string") return { text: error, notFound: /document not found/i.test(error) };
  if (error instanceof Error) {
    return { text: error.message, notFound: /document not found/i.test(error.message) };
  }
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; detail?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    const detail = typeof record.detail === "string" ? record.detail : "";
    const notFound = /document not found/i.test(detail) || /\b404\b/.test(message);
    const text = [message, detail].filter(Boolean).join("\n");
    return { text: text || "document request failed", notFound };
  }
  return { text: String(error), notFound: false };
}

type SourcePreview = {
  file: DocFile;
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
};

function asSources(value: unknown): Source[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Source[] : [];
}

function links(ids: string[] | undefined, onOpen: (id: string) => void) {
  if (!ids?.length) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <Group gap={6}>
      {ids.map((id) => (
        <Button key={id} size="compact-xs" variant="subtle" onClick={() => onOpen(id)}>{id}</Button>
      ))}
    </Group>
  );
}

export function RuleDetail({
  node,
  m,
  onOpen,
}: {
  node: GraphNode | null;
  m: Messages;
  onOpen: (id: string) => void;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<SourcePreview | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [failedSource, setFailedSource] = useState<Source | null>(null);
  const article = useRef<HTMLDivElement>(null);
  const docViewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setSources([]);
    setError("");
    if (!node || (node._kind && node._kind !== "rule")) return;
    setLoading(true);
    deskClient.ruleDetail(node.id)
      .then((value) => { if (active) setSources(asSources(value.resolved_sources)); })
      .catch((reason) => { if (active) setError(String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [node]);

  const openSource = (source: Source) => {
    const path = source.path ?? "";
    if (!path) return;
    setSourceError("");
    setFailedSource(null);
    setSourcePreview(null);
    void deskClient.docFile(path)
      .then((file) => setSourcePreview({
        file,
        heading: source.heading,
        lineStart: source.line_start,
        lineEnd: source.line_end,
      }))
      .catch((reason) => {
        const failure = deskFailure(reason);
        setFailedSource(source);
        setSourceError(failure.notFound ? m.sourceNotIndexed : failure.text);
      });
  };

  const sourcePreviewHtml = useCallback((preview: SourcePreview) => {
    const ranged = preview.lineStart
      ? { start: preview.lineStart, end: preview.lineEnd || preview.lineStart }
      : preview.heading
        ? headingSection(preview.file.content, preview.heading)
        : null;
    return ranged
      ? renderDocBody(preview.file.content, ranged.start, ranged.end)
      : renderSafeMarkdown(preview.file.content);
  }, []);

  useEffect(() => {
    if (!sourcePreview) return;
    let active = true;
    const paint = () => {
      const root = article.current;
      if (!active || !root) return;
      try {
        highlightTerms(root, [node?.id ?? "", node?.claim ?? "", sourcePreview.heading ?? ""]);
        scrollDocAnchorIntoView(root, docViewport.current);
      } catch {
        // Source content remains readable if optional highlighting cannot run.
      }
      void runMermaidInElement(root).catch(() => {});
    };
    const raf = window.requestAnimationFrame(() => window.requestAnimationFrame(paint));
    const timer = window.setTimeout(paint, 120);
    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [sourcePreview, node?.id, node?.claim]);

  if (!node) return <Text c="dimmed" size="sm">{m.detailEmpty}</Text>;

  const evidence = node.evidence_log.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as { at?: string; kind?: string; text?: string };
    return [entry];
  }).slice().reverse();

  return (
    <Stack gap="sm" data-testid="rule-detail">
      <Group justify="space-between" align="flex-start">
        <Code>{node.id}</Code>
        <Badge
          variant="light"
          color={
            node._kind && node._kind !== "rule"
              ? "violet"
              : ruleStatusBadgeColor(node.status)
          }
        >
          {node._kind && node._kind !== "rule" ? node._kind : node.status}
        </Badge>
      </Group>
      <Text fw={600} size="sm" lh={1.45}>{node.heading || node.claim}</Text>
      {node.path && (
        <Button size="compact-sm" variant="light" onClick={() => openSource({ path: node.path, heading: node.heading })}>{node.path}</Button>
      )}
      {(!node._kind || node._kind === "rule") && (
        <Stack gap={8}>
          <Group gap={6}>
            {node.scope.map((scope) => {
              const tint = scopeColor(scope);
              return (
                <Badge
                  key={scope}
                  variant="outline"
                  styles={{ root: { borderColor: tint, color: tint } }}
                >
                  {scope}
                </Badge>
              );
            })}
          </Group>
          <SimpleGrid cols={2} spacing={6}>
            <Text size="xs">{m.detailConfidence} {node.confidence.toFixed(2)}</Text>
            <Text size="xs">{m.detailReinforced} {node.reinforcement_count}</Text>
          </SimpleGrid>
          {node.query_local?.trim() && <Text size="xs">{m.detailQueryLocal}: {node.query_local}</Text>}
          {(node.supersedes?.length ?? 0) > 0 && (
            <div><Text size="xs" c="dimmed">{m.detailSupersedes}</Text>{links(node.supersedes, onOpen)}</div>
          )}
          {(node.related?.length ?? 0) > 0 && (
            <div><Text size="xs" c="dimmed">{m.detailRelated}</Text>{links(node.related, onOpen)}</div>
          )}
          {(node.conflicts_with?.length ?? 0) > 0 && (
            <div><Text size="xs" c="dimmed">{m.detailConflicts}</Text>{links(node.conflicts_with, onOpen)}</div>
          )}
          {node.referenced_by.length > 0 && (
            <div>
              <Text size="xs" c="dimmed">{m.detailReferenced}</Text>
              <Stack gap={4}>
                {node.referenced_by.map((link) => (
                  <Button key={`${link.kind ?? ""}-${link.id}`} size="compact-xs" variant="subtle" justify="flex-start" onClick={() => onOpen(link.id)}>
                    {link.id}{link.kind ? ` · ${link.kind}` : ""}
                  </Button>
                ))}
              </Stack>
            </div>
          )}
          <div>
            <Text size="xs" c="dimmed">{m.detailSources}</Text>
            {loading && <Loader size="xs" />}
            {error && <Alert color="red">{error}</Alert>}
            {!loading && sources.length === 0 && !error && <Text size="sm" c="dimmed">—</Text>}
            <Stack gap={4}>
              {sources.map((source, index) => (
                <Button
                  key={`${source.path ?? ""}-${index}`}
                  size="compact-xs"
                  variant="subtle"
                  justify="flex-start"
                  onClick={() => openSource(source)}
                >
                  {source.heading || source.path}
                </Button>
              ))}
            </Stack>
          </div>
          <div>
            <Text size="xs" c="dimmed">{m.detailEvidence}</Text>
            {evidence.length === 0 ? <Text size="sm" c="dimmed">{m.detailEvidenceEmpty}</Text> : (
              <Stack gap={6}>
                {evidence.map((entry, index) => (
                  <Text key={`${entry.at ?? ""}-${index}`} size="sm">
                    <Text span c="dimmed" size="xs">{entry.at} {entry.kind}</Text>
                    {entry.text ? ` — ${entry.text}` : ""}
                  </Text>
                ))}
              </Stack>
            )}
          </div>
        </Stack>
      )}
      <Drawer
        opened={Boolean(sourcePreview) || Boolean(sourceError)}
        onClose={() => { setSourcePreview(null); setSourceError(""); setFailedSource(null); }}
        position="right"
        size="xl"
        title={sourcePreview?.file.path ?? failedSource?.path ?? m.detailSources}
      >
        {sourceError && (
          <Stack gap="sm">
            <Alert color="yellow">{sourceError}</Alert>
            {failedSource?.path && <Code>{failedSource.path}</Code>}
            {failedSource?.heading && <Text fw={600} size="sm">{failedSource.heading}</Text>}
            {failedSource?.snippet && <Text size="sm">{failedSource.snippet}</Text>}
          </Stack>
        )}
        {sourcePreview && (
          <ScrollArea h="calc(100vh - 100px)" viewportRef={docViewport}>
            <div
              ref={article}
              className="audit-markdown"
              dangerouslySetInnerHTML={{ __html: sourcePreviewHtml(sourcePreview) }}
            />
          </ScrollArea>
        )}
      </Drawer>
    </Stack>
  );
}
