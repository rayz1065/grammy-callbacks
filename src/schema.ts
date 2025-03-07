interface PrimitiveMap {
  number: number;
  string: string;
  boolean: boolean;
  bigint: bigint;
}

export type CallbackSchemaPrimitive<T extends string = keyof PrimitiveMap> = {
  type: T;
  nullable?: boolean;
};
export type CallbackSchemaArray = {
  type: "array";
  nullable?: boolean;
  items: CallbackSchemaItem;
};
type EnumValue = PrimitiveMap[keyof PrimitiveMap];
export type CallbackSchemaEnum<T extends EnumValue = EnumValue> = {
  type: "enum";
  nullable?: boolean;
  enum: ReadonlyArray<T>;
};
export type CallbackSchemaObject = {
  type: "object";
  nullable?: boolean;
  properties: { [K: string]: CallbackSchemaItem };
};
export type CallbackSchemaUnion = {
  type: "union";
  nullable?: boolean;
  options: { [K: string]: CallbackSchemaItem };
};
/**
 * inspired by JSON schema, represents an item of any type
 */
export type CallbackSchemaItemCore =
  | CallbackSchemaPrimitive
  | CallbackSchemaObject
  | CallbackSchemaArray
  | CallbackSchemaUnion
  | CallbackSchemaEnum<EnumValue>;
/**
 * Callback schema item, can be an object describing the type or a string
 * corresponding to one of the primitive types.
 */
export type CallbackSchemaItem = CallbackSchemaItemCore | keyof PrimitiveMap;
/**
 * Schema for a encoding and decoding a callback query
 */
export type CallbackSchema = Record<string, CallbackSchemaItem>;

/**
 * Normalize a callback schema item, to omit string types
 */
type NormalizeSchemaItem<T extends CallbackSchemaItem> = T extends string
  ? CallbackSchemaPrimitive<T>
  : T;

/**
 * Adds null when necessary
 */
type InferMaybeNullable<T extends CallbackSchemaItem, S> = T extends {
  nullable: true;
} ? null | S
  : S;
type InferItemCore<T extends CallbackSchemaItemCore> = InferMaybeNullable<
  T,
  (PrimitiveMap & {
    object: T extends { type: "object" }
      ? { [K in keyof T["properties"]]: InferItem<T["properties"][K]> }
      : never;
    array: T extends { type: "array" } ? Array<InferItem<T["items"]>> : never;
    enum: T extends { type: "enum" } ? T["enum"][number] : never;
    union: T extends { type: "union" } ? {
        [K in keyof T["options"]]: {
          type: K;
          data: InferItem<T["options"][K]>;
        };
      }[keyof T["options"]]
      : never;
  })[T["type"]]
>;
/**
 * The type inferred by a callback schema item
 */
export type InferItem<T extends CallbackSchemaItem> = InferItemCore<
  NormalizeSchemaItem<T>
>;

/**
 * Type inferred from a callback schema
 */
export type InferCallbackSchema<T extends CallbackSchema> = InferItem<{
  type: "object";
  properties: T;
}>;

export function normalizeSchemaItem<T extends CallbackSchemaItem>(
  item: T,
): NormalizeSchemaItem<T> {
  if (typeof item === "string") {
    return { type: item } as NormalizeSchemaItem<T>;
  }
  return item as Exclude<T, string>;
}
