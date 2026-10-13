"use client";

import type { ConfigField, ConfigFields } from "@rectangles/engine";
import { useId, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ComponentConfig } from "@/modules/whiteboard";
import { optionLabel, parseNumberField } from "../lib/parse-field-input";

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
    <>
      <InputGroup>
        <InputGroupInput
          id={inputId}
          inputMode="decimal"
          value={text}
          aria-invalid={error !== null}
          aria-describedby={helpId}
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
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
      {error !== null && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * One setting of a component, drawn from its field spec. A number is written to the
 * board when the field is left or Enter is pressed, and only if it is valid; an invalid
 * value shows the reason and never reaches the saved design.
 */
export function ConfigFieldInput(props: ConfigFieldInputProps) {
  const { fieldName, field, config, onCommit } = props;
  const inputId = useId();
  const helpId = useId();

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>{field.label}</Label>
      {field.kind === "choice" ? (
        <Select value={String(config[fieldName] ?? field.default)} onValueChange={onCommit}>
          <SelectTrigger id={inputId} className="w-full" aria-describedby={helpId}>
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
      <p id={helpId} className="text-xs text-muted-foreground">
        {field.description}
      </p>
    </div>
  );
}
