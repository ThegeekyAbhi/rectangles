/** Shows a field in the inspector only while another field holds one of the given values. */
export interface FieldRelevance {
  readonly field: string;
  readonly isOneOf: readonly string[];
}

interface ConfigFieldBase {
  /** Short name shown next to the input. */
  readonly label: string;
  /** One line explaining what changing this field does. */
  readonly description: string;
  readonly relevantWhen?: FieldRelevance;
}

/** A numeric field. `integer` additionally rejects fractional values. */
export interface NumberField extends ConfigFieldBase {
  readonly kind: "number" | "integer";
  readonly default: number;
  readonly min: number;
  readonly max: number;
  /** Display unit, for example `ms` or `requests/s`. */
  readonly unit?: string;
}

/** A field that takes exactly one of a fixed set of string values. */
export interface ChoiceField extends ConfigFieldBase {
  readonly kind: "choice";
  readonly options: readonly string[];
  readonly default: string;
}

export type ConfigField = NumberField | ChoiceField;

/** The config a component accepts: one spec per field, keyed by field name. */
export type ConfigFields = Readonly<Record<string, ConfigField>>;

/**
 * The validated config object a component receives, derived from its field specs.
 * Declare the specs with `as const satisfies ConfigFields` so choices stay literal.
 */
export type ConfigOf<Fields extends ConfigFields> = {
  readonly [Name in keyof Fields]: FieldValue<Fields[Name]>;
};

/** A choice field holds one of its options; any other field holds a number. */
type FieldValue<Field> = Field extends {
  readonly kind: "choice";
  readonly options: readonly (infer Option)[];
}
  ? Option
  : number;
