import { either } from "fp-ts";
import { Either } from "fp-ts/lib/Either";
import { flow } from "fp-ts/lib/function";
import { Decoder, Errors } from "io-ts";
import { failure } from "io-ts/lib/PathReporter";

export type ApiError =
  | {
      tag: "JsonParseError";
      parseError: string;
    }
  | {
      tag: "DecodeError";
      decodeError: Errors;
    };

export function showApiError(err: ApiError): string {
  switch (err.tag) {
    case "JsonParseError":
      return `JsonParseError: "${err.parseError}"`;
    case "DecodeError":
      return `DecodeError: "${failure(err.decodeError)}"`;
  }
}

export const decode = <A>(codec: Decoder<unknown, A>) =>
  flow(
    codec.decode,
    either.mapLeft<Errors, ApiError>((e) => ({
      tag: "DecodeError",
      decodeError: e,
    }))
  );

export function parseJson(text: string): Either<ApiError, unknown> {
  return either.tryCatch<ApiError, unknown>(
    () => JSON.parse(text),
    (_) => ({ tag: "JsonParseError", parseError: "JSON parse failed" })
  );
}
