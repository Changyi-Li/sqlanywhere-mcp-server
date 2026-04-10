import { getAuthorizedUsers } from "../guardrails.js";

export const AUTHORIZED_USERS = getAuthorizedUsers();

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}
