interface PrimitiveMap {
  number: number;
  string: string;
  boolean: boolean;
  bigint: bigint;
}

/**
 * inspired by JSON schema, represents a primitive
 */
export type CallbackSchemaPrimitive<T extends string = keyof PrimitiveMap> = {
  type: T;
  nullable?: boolean;
  properties?: never;
  items?: never;
  enum?: never;
};
/**
 * inspired by JSON schema, represents an array
 */
export type CallbackSchemaArray = {
  type: "array";
  nullable?: boolean;
  properties?: never;
  items: CallbackSchemaItem;
  enum?: never;
};
type EnumValue = PrimitiveMap[keyof PrimitiveMap];
/**
 * inspired by JSON schema, represents an enum
 */
export type CallbackSchemaEnum<
  T extends ReadonlyArray<EnumValue>,
> = {
  type: "enum";
  nullable?: boolean;
  properties?: never;
  items?: never;
  enum: T;
};
/**
 * inspired by JSON schema, represents an object
 */
export type CallbackSchemaObject = {
  type: "object";
  nullable?: boolean;
  properties: { [K: string]: CallbackSchemaItem };
  items?: never;
  enum?: never;
};
/**
 * inspired by JSON schema, represents an item of any type
 */
export type CallbackSchemaItemCore =
  | CallbackSchemaPrimitive
  | CallbackSchemaObject
  | CallbackSchemaArray
  | CallbackSchemaEnum<ReadonlyArray<EnumValue>>;
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
    number: number;
    string: string;
    boolean: boolean;
    bigint: bigint;
    object: T extends { type: "object" }
      ? { [K in keyof T["properties"]]: InferItem<T["properties"][K]> }
      : never;
    array: T extends { type: "array" } ? Array<InferItem<T["items"]>> : never;
    enum: T extends { type: "enum" } ? T["enum"][number] : never;
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
