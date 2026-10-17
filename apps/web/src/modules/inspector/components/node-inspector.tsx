"use client";

import { Fragment } from "react";
import { InfoTip } from "@/components/info-tip";
import { InlineNameInput } from "@/components/inline-name-input";
import type { ComponentNodeData } from "@/modules/whiteboard";
import { ComponentIconChip, findComponentDefinition, useWhiteboardStore } from "@/modules/whiteboard";
import { groupFieldsBySection } from "../lib/field-sections";
import { ConfigFieldInput } from "./config-field-input";
import { ScaleOutControl } from "./scale-out-control";

/** What the component is, what it leaves out, all behind one (i). */
function ComponentAbout({ description, notModeled }: { description: string; notModeled: readonly string[] }) {
  return (
    <InfoTip label="About this component" side="left">
      <p>{description}</p>
      {notModeled.length > 0 && (
        <>
          <p className="mt-2 font-medium">Not modelled</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {notModeled.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </>
      )}
    </InfoTip>
  );
}

export function NodeInspector({ nodeId, data }: { nodeId: string; data: ComponentNodeData }) {
  const renameNode = useWhiteboardStore((state) => state.renameNode);
  const setNodeConfig = useWhiteboardStore((state) => state.setNodeConfig);
  const definition = findComponentDefinition(data.componentType);
  const sections = definition === undefined ? [] : groupFieldsBySection(definition.configFields, data.config);
  // Scaling out sits after the section it names, or last if that section is not shown.
  const afterSection = definition?.scaleOut?.afterSection;
  const scaleOutAfter = sections.some((section) => section.title === afterSection)
    ? afterSection
    : sections.at(-1)?.title;

  return (
    // A short fade as the selection changes, so the switch reads as one panel updating.
    <div className="flex flex-col duration-150 ease-out animate-in fade-in-0 slide-in-from-right-1 motion-reduce:animate-none">
      <header className="flex items-center gap-3 border-b p-4 pr-11">
        <ComponentIconChip componentType={data.componentType} size="lg" />
        <div className="min-w-0 flex-1">
          {/* Remounting on a new label resets the draft after undo or redo. */}
          <InlineNameInput
            key={data.label}
            value={data.label}
            ariaLabel="Name"
            maxLength={60}
            className="-mx-1.5 w-full"
            onCommit={(label) => renameNode(nodeId, label)}
          />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{definition?.label ?? "Unknown component"}</span>
            {definition !== undefined && (
              <ComponentAbout description={definition.description} notModeled={definition.notModeled} />
            )}
          </div>
        </div>
      </header>

      {definition === undefined ? (
        <p className="p-4 text-xs text-muted-foreground">
          This version of Rectangles has no component of type “{data.componentType}”. It is kept on the board
          but cannot be configured or simulated.
        </p>
      ) : (
        <div className="@container flex flex-col gap-5 p-4">
          {sections.map((section, index) => {
            const headingId = `${nodeId}-settings-${index}`;
            return (
              <Fragment key={section.title ?? ""}>
                <section aria-labelledby={headingId} className="flex flex-col gap-3">
                  <h3 id={headingId} className="mb-0.5 text-xs font-medium text-muted-foreground">
                    {section.title ?? "Settings"}
                  </h3>
                  {section.fields.map(([fieldName, field]) => (
                    <ConfigFieldInput
                      key={fieldName}
                      fieldName={fieldName}
                      field={field}
                      fields={definition.configFields}
                      config={data.config}
                      onCommit={(value) => setNodeConfig(nodeId, { ...data.config, [fieldName]: value })}
                    />
                  ))}
                </section>
                {definition.scaleOut !== undefined && section.title === scaleOutAfter && (
                  <ScaleOutControl nodeId={nodeId} routerType={definition.scaleOut.via} />
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
