import { NextResponse } from "next/server";

type ConnectorError = {
  success: false;
  code: string;
  error: string;
  retryable: boolean;
};

export function connectorError(
  code: string,
  error: string,
  status: number,
  retryable: boolean,
) {
  return NextResponse.json<ConnectorError>(
    { success: false, code, error, retryable },
    { status },
  );
}
