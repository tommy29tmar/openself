import { registerConnector } from "./registry";
import { githubDefinition } from "./github/definition";
import { linkedinZipDefinition } from "./linkedin-zip/definition";

registerConnector(githubDefinition);
registerConnector(linkedinZipDefinition);
