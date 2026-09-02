import { generatedIn } from "../../telemetry/environment.js";

// PostHog project key. Empty disables the beacon: no key, no snippet, no
// requests. Set it to turn report telemetry on for published builds.
const POSTHOG_KEY = "phc_BGjn97jvL862fdhHAKzJ7mhuXBZm8CEe83ENuMvpCgdD";
const POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Inline beacon for the generated report. Every string it posts is either a
 * constant or a name from SECTIONS/ACTIONS, and the only measured values are
 * click coordinates as viewport percentages, so no path, project name, or
 * source text can leave.
 */
export function getTelemetryScript(version: string, scanId: string): string {
	return POSTHOG_KEY
		? buildBeacon(POSTHOG_KEY, version, generatedIn(), scanId)
		: "";
}

export function buildBeacon(
	key: string,
	version: string,
	source: "ci" | "cli",
	scanId: string
): string {
	return `<script>
(function () {
  var KEY = ${JSON.stringify(key)};
  var URL = ${JSON.stringify(`${POSTHOG_HOST}/e/`)};
  var VERSION = ${JSON.stringify(version)};
  var SOURCE = ${JSON.stringify(source)};
  var SCAN = ${JSON.stringify(scanId)};
  var SECTIONS = ["summary", "diagnosis", "modules", "endpoints", "schema", "lab", "boot"];
  var ACTIONS = ["rule_lab_run", "rule_lab_preset_loaded", "rule_lab_scope_changed", "rule_lab_result_opened", "rule_lab_code_edited", "rule_lab_metadata_changed", "module_opened_from_finding", "module_opened_from_tree", "graph_recentered", "graph_zoomed", "graph_sidebar_toggled", "module_tree_expanded", "schema_tree_expanded", "endpoint_code_opened", "boot_span_selected"];
  var id;
  try {
    id = crypto.randomUUID();
  } catch (e) {
    id = String(Math.random()).slice(2);
  }

  function send(event, section, extra) {
    var props = {
      $current_url: "report://local",
      version: VERSION,
      generated_in: SOURCE,
    };
    if (SCAN) {
      props.scan_id = SCAN;
    }
    if (section) {
      props.section = section;
    }
    if (extra) {
      for (var k in extra) props[k] = extra[k];
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

  window.__ndTrack = function (name) {
    if (SECTIONS.indexOf(name) !== -1) {
      send("report_section_viewed", name);
    } else if (ACTIONS.indexOf(name) !== -1) {
      send("report_action", name);
    }
  };

  // Click position only, as a percentage of the viewport. No element is read.
  var clicks = [];
  document.addEventListener("click", function (ev) {
    if (clicks.length >= 200) return;
    clicks.push({
      x: Math.round((ev.clientX / window.innerWidth) * 1000) / 10,
      y: Math.round((ev.clientY / window.innerHeight) * 1000) / 10,
      tab: activeTabName(),
    });
  });

  function activeTabName() {
    for (var i = 0; i < SECTIONS.length; i++) {
      var el = document.getElementById("tab-" + SECTIONS[i]);
      if (el && el.classList.contains("active")) return SECTIONS[i];
    }
    return "unknown";
  }

  function flush() {
    if (!clicks.length) return;
    send("report_clicks", null, { clicks: clicks.splice(0, clicks.length) });
  }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  send("report_opened");
})();
</script>`;
}
