import {
  CallbackSchema,
  CallbackSchemaItem,
  CallbackSchemaItemCore,
  normalizeSchemaItem,
} from "./schema.ts";

const poison = Symbol("POISON");
type DecoderFactory<T = CallbackSchemaItemCore["type"]> = (
  spec: CallbackSchemaItemCore & { type: T },
) => Decoder;
type Decoder = (payload: unknown) => unknown;

/**
 * Get a function to decode a payload based on a given schema.
 * The returned value may not correspond to one satisfying the schema.
 * Specifically, errors in decoding may result in `poison` being present in the
 * return value.
 */
export function getSchemaDecoder(schema: CallbackSchema): Decoder {
  return getDecoder({ type: "object", properties: schema });
}

/**
 * Function factories based on a spec to transform an encoded payload of a
 * specific type from an array of arrays into the original data.
 *
 * Two different operations are performed: converting datatypes from the
 * supported ones (e.g. string back into bigint) and converting arrays into
 * objects where necessary.
 * Type checking is kept lightweight since a more specific type-checking
 * procedure is done afterwards.
 * Some values still make the conversion procedure impossible, instead of
 * throwing an error we poison the return value to ensure type-checking will
 * fail.
 */
const decoders: {
  [K in CallbackSchemaItemCore["type"]]: DecoderFactory<K>;
} = {
  boolean: () => (payload) => {
    if (typeof payload !== "number") {
      return poison;
    }
    const res = [false, true, null].at(payload);
    return res === undefined ? poison : res;
  },
  bigint: () => (payload) => {
    if (payload === null) {
      return null;
    } else if (typeof payload !== "string") {
      return poison;
    }
    try {
      return BigInt(`0x${payload}`);
    } catch {
      return poison;
    }
  },
  number: () => (payload) => payload,
  string: () => (payload) => payload,
  array: (spec) => {
    const child = getDecoder(spec.items);

    return (payload) => {
      if (payload === null) {
        return null;
      } else if (!Array.isArray(payload)) {
        return poison;
      }
      return payload.map(child);
    };
  },
  object: (spec) => {
    const keys = Object.keys(spec.properties).sort();
    const children = Object.fromEntries(
      keys.map((k) => [k, getDecoder(spec.properties[k])]),
    );
    return (payload) => {
      if (payload === null) {
        return null;
      } else if (!Array.isArray(payload) || payload.length !== keys.length) {
        return poison;
      }
      return Object.fromEntries(
        keys.map((k, i) => [k, children[k](payload[i])]),
      );
    };
  },
  enum: (spec) => {
    return (payload) => {
      if (!Number.isInteger(payload)) {
        return poison;
      } else if (payload === 0) {
        return null;
      }
      const index = payload as number - 1;
      if (index < 0 || index >= spec.enum.length) {
        return poison;
      }
      return spec.enum[index];
    };
  },
};

function getDecoder(spec: CallbackSchemaItem) {
  spec = normalizeSchemaItem(spec);
  const decoder = decoders[spec.type] as DecoderFactory;
  return decoder(spec);
}
