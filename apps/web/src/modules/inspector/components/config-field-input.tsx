"use client";

import type { ConfigField, ConfigFields } from "@rectangles/engine";
import { useId, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ComponentConfig } from "@/modules/whiteboard";
import { optionLabel, parseNumberField, unitLabel } from "../lib/parse-field-input";

interface ConfigFieldInputProps {
  fieldName: string;
  field: ConfigField;
  fields: ConfigFields;
  config: ComponentConfig;
  onCommit: (value: number | string) => void;
}

function NumberInput({ fieldName, field, fields, config, onCommit, inputId, helpId }: ConfigFieldInputProps & {
  inputId: string;
  helpId: string;
}) {
  const savedText = String(config[fieldName] ?? "");
  const [text, setText] = useState(savedText);
  // A saved value can itself be out of range, for example after an import; say so at once.
  const [isChecked, setIsChecked] = useState(() => !parseNumberField(fields, config, fieldName, savedText).ok);
  const parsed = parseNumberField(fields, config, fieldName, text);
  const error = isChecked && !parsed.ok ? parsed.message : null;
  const unit = field.kind === "choice" ? undefined : field.unit;

  const commit = () => {
    setIsChecked(true);
    if (parsed.ok && parsed.value !== config[fieldName]) {
      onCommit(parsed.value);
    }
  };

  return (
    <div className="grid gap-1">
      <InputGroup>
        <InputGroupInput
          id={inputId}
          // Named directly: the visible label also holds the (i) button, which is not part of the name.
          aria-label={field.label}
          inputMode="decimal"
          value={text}
          aria-invalid={error !== null}
          aria-describedby={helpId}
          className="tabular-nums @min-[17rem]:text-right"
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit();
            } else if (event.key === "Escape") {
              setText(savedText);
              setIsChecked(false);
            }
          }}
        />
        {unit !== undefined && (
          <InputGroupAddon align="inline-end">
            <InputGroupText title={unit}>{unitLabel(unit)}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
      {error !== null && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One setting of a component, drawn from its field spec, with its explanation behind an
 * (i) button. When the inspector is wide enough the name and value share a row;
 * narrower, the name sits above the value. The choice follows the panel's own width
 * (a container query), not the window's, because the panel can be resized. A number is
 * written to the board when the field is left or Enter is pressed, and only if it is
 * valid; an invalid value shows the reason and never reaches the saved design.
 */
export function ConfigFieldInput(props: ConfigFieldInputProps) {
  const { fieldName, field, config, onCommit } = props;
  const inputId = useId();
  const helpId = useId();
  const splitAt = field.label.lastIndexOf(" ") + 1;
  const leadingWords = field.label.slice(0, splitAt);
  const lastWord = field.label.slice(splitAt);

  return (
    <div className="grid gap-1.5 @min-[17rem]:grid-cols-[minmax(0,1fr)_9rem] @min-[17rem]:items-start @min-[17rem]:gap-3">
      {/* The (i) sits in the text's flow, so it follows the last word when the name wraps. */}
      <div className="min-w-0 text-sm leading-5 @min-[17rem]:py-1.5">
        <Label htmlFor={inputId} className="inline font-normal text-muted-foreground">
          {leadingWords}
          {/* The last word and the (i) wrap together, so the icon never sits on a line alone. */}
          <span className="whitespace-nowrap">
            {lastWord}
            <span className="ml-1.5 inline-flex align-[-2px]">
              <InfoTip label="What this setting means" side="left">
                {field.description}
              </InfoTip>
            </span>
          </span>
        </Label>
        {/* The explanation stays available to screen readers, which do not see the tooltip. */}
        <span id={helpId} className="sr-only">
          {field.description}
        </span>
      </div>
      <div className="min-w-0">
        {field.kind === "choice" ? (
          <Select value={String(config[fieldName] ?? field.default)} onValueChange={onCommit}>
            <SelectTrigger id={inputId} className="w-full" aria-label={field.label} aria-describedby={helpId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {optionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          // Remounting on a new saved value resets the draft after undo, redo or a commit.
          <NumberInput key={String(config[fieldName])} {...props} inputId={inputId} helpId={helpId} />
        )}
      </div>
    </div>
  );
}
