import { generatedIn } from "../../telemetry/environment.js";

// PostHog project key. Empty disables the beacon: no key, no snippet, no
// requests. Set it to turn report telemetry on for published builds.
const POSTHOG_KEY = "";
const POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Inline beacon for the generated report. Posts two fixed events and reads
 * nothing from the page, so no path, project name, or source text can leave.
 */
export function getTelemetryScript(version: string): string {
	return POSTHOG_KEY ? buildBeacon(POSTHOG_KEY, version, generatedIn()) : "";
}

export function buildBeacon(
	key: string,
	version: string,
	source: "ci" | "cli"
): string {
	return `<script>
(function () {
  var KEY = ${JSON.stringify(key)};
  var URL = ${JSON.stringify(`${POSTHOG_HOST}/e/`)};
  var VERSION = ${JSON.stringify(version)};
  var SOURCE = ${JSON.stringify(source)};
  var SECTIONS = ["summary", "diagnosis", "modules", "endpoints", "schema", "lab"];
  var id;
  try {
    id = crypto.randomUUID();
  } catch (e) {
    id = String(Math.random()).slice(2);
  }

  function send(event, section) {
    var props = {
      $current_url: "report://local",
      version: VERSION,
      generated_in: SOURCE,
    };
    if (section) {
      props.section = section;
    }
    try {
      fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          api_key: KEY,
          event: event,
          distinct_id: id,
          properties: props,
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  window.__ndTrack = function (section) {
    if (SECTIONS.indexOf(section) !== -1) {
      send("report_section_viewed", section);
    }
  };
  send("report_opened");
})();
</script>`;
}
