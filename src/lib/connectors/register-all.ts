import { registerConnector } from "./registry";
import { githubDefinition } from "./github/definition";
import { linkedinZipDefinition } from "./linkedin-zip/definition";
import { spotifyDefinition } from "./spotify/definition";
import { rssDefinition } from "./rss/definition";
import { stravaDefinition } from "./strava/definition";

registerConnector(githubDefinition);
registerConnector(linkedinZipDefinition);
registerConnector(spotifyDefinition);
registerConnector(rssDefinition);
registerConnector(stravaDefinition);
