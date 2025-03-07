import {
  CallbackSchema,
  CallbackSchemaItem,
  CallbackSchemaItemCore,
  CallbackSchemaPrimitive,
  InferCallbackSchema,
  normalizeSchemaItem,
} from "./schema.ts";

export interface SchemaValidationError {
  path: (string | number)[];
  description: string;
  found: unknown;
}

export type CallbackSchemaValidationResult<T extends CallbackSchema> =
  | { success: true; errors?: never; data: InferCallbackSchema<T> }
  | {
    success: false;
    errors: SchemaValidationError[];
    data?: never;
  };

type ValidatorFactory<T = CallbackSchemaItemCore["type"]> = (
  spec: CallbackSchemaItemCore & { type: T },
) => Validator;
type ValidationResult =
  | { success: true; errors?: never }
  | {
    success: false;
    errors: SchemaValidationError[];
  };
type Validator = (payload: unknown) => ValidationResult;
type CallbackSchemaValidator<T extends CallbackSchema> = (
  payload: unknown,
) => CallbackSchemaValidationResult<T>;

/**
 * Get a function to check that a payload respects a given schema.
 */
export function getSchemaValidator<T extends CallbackSchema>(
  schema: T,
): CallbackSchemaValidator<T> {
  const validator = getValidator({ type: "object", properties: schema });
  return (payload) => {
    const res = validator(payload);
    if (res.success) {
      return { success: true, data: payload as InferCallbackSchema<T> };
    } else {
      return res;
    }
  };
}

/**
 * Returns an error if the spec requires the value to be non-nullable and the
 * value is null
 */
function checkNullability(
  spec: { nullable?: boolean },
  payload: unknown,
): SchemaValidationError | null {
  if (!spec.nullable && payload === null) {
    return {
      description: "Unexpected null on non-nullable field",
      found: payload,
      path: [],
    };
  }
  return null;
}

/**
 * Re-usable code to check the type of a primitive
 */
function checkPrimitive(spec: CallbackSchemaPrimitive): Validator {
  return (payload) => {
    const nullableError = checkNullability(spec, payload);
    if (nullableError) {
      return { success: false, errors: [nullableError] };
    }
    if (payload !== null && typeof payload !== spec.type) {
      return {
        success: false,
        errors: [
          { description: `Expected ${spec.type}`, found: payload, path: [] },
        ],
      };
    }
    return { success: true };
  };
}

/**
 * Function factories based on a spec to check that a payload of a specific type
 * respects the given spec.
 */
const validators: {
  [K in CallbackSchemaItemCore["type"]]: ValidatorFactory<K>;
} = {
  boolean: (spec) => checkPrimitive(spec),
  bigint: (spec) => checkPrimitive(spec),
  number: (spec) => checkPrimitive(spec),
  string: (spec) => checkPrimitive(spec),
  array: (spec) => {
    const child = getValidator(spec.items);

    return (payload) => {
      const nullableError = checkNullability(spec, payload);
      if (nullableError) {
        return { success: false, errors: [nullableError] };
      } else if (payload === null) {
        return { success: true };
      } else if (!Array.isArray(payload)) {
        return {
          success: false,
          errors: [{ description: "Expected array", found: payload, path: [] }],
        };
      }

      const results = payload.map(child);

      const errors = results.flatMap((childRes, i) =>
        childRes.success ? [] : childRes.errors.map((error) => ({
          ...error,
          path: [i, ...error.path],
        }))
      );

      if (errors.length === 0) {
        return { success: true };
      } else {
        return {
          success: false,
          errors,
        };
      }
    };
  },
  object: (spec) => {
    const keys = Object.keys(spec.properties);
    const children = Object.fromEntries(
      keys.map((k) => [k, getValidator(spec.properties[k])]),
    );

    return (payload) => {
      const nullableError = checkNullability(spec, payload);
      if (nullableError) {
        return { success: false, errors: [nullableError] };
      } else if (payload === null) {
        return { success: true };
      } else if (Array.isArray(payload) || typeof payload !== "object") {
        return {
          success: false,
          errors: [
            { description: "Expected object", found: payload, path: [] },
          ],
        };
      }

      if (!keys.reduce((prev, key) => prev && key in payload, true)) {
        return {
          success: false,
          errors: [
            {
              description: "Some keys are missing from the object",
              found: payload,
              path: [],
            },
          ],
        };
      }

      const errors = keys.flatMap((key) => {
        const res = children[key](payload[key as keyof typeof payload]);
        return res.success
          ? []
          : res.errors.map((x) => ({ ...x, path: [key, ...x.path] }));
      });

      if (errors.length === 0) {
        return { success: true };
      } else {
        return {
          success: false,
          errors,
        };
      }
    };
  },
  union: (spec) => {
    const keys = Object.keys(spec.options);
    const children = Object.fromEntries(
      keys.map((k) => [k, getValidator(spec.options[k])]),
    );

    return (payload) => {
      const nullableError = checkNullability(spec, payload);
      if (nullableError) {
        return { success: false, errors: [nullableError] };
      } else if (payload === null) {
        return { success: true };
      } else if (Array.isArray(payload) || typeof payload !== "object") {
        return {
          success: false,
          errors: [
            { description: "Expected object", found: payload, path: [] },
          ],
        };
      } else if (!("type" in payload) || !("data" in payload)) {
        return {
          success: false,
          errors: [
            {
              description: "Expected type and data keys",
              found: payload,
              path: [],
            },
          ],
        };
      } else if (keys.indexOf(payload.type as string) === -1) {
        return {
          success: false,
          errors: [
            {
              description: "Invalid union type",
              found: payload,
              path: [],
            },
          ],
        };
      }

      return children[payload.type as string](payload.data);
    };
  },
  enum: (spec) => {
    return (payload) => {
      const nullableError = checkNullability(spec, payload);
      if (nullableError) {
        return { success: false, errors: [nullableError] };
      } else if (payload === null) {
        return { success: true };
        // deno-lint-ignore no-explicit-any
      } else if (!spec.enum.includes(payload as any)) {
        return {
          success: false,
          errors: [
            {
              description: `Expected one of ${spec.enum.join(", ")}`,
              found: payload,
              path: [],
            },
          ],
        };
      }

      return { success: true };
    };
  },
};

function getValidator(spec: CallbackSchemaItem) {
  spec = normalizeSchemaItem(spec);
  const validator = validators[spec.type] as ValidatorFactory;
  return validator(spec);
}
