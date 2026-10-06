import { docHref } from "../links.js";

export default function TraceMarker({ marker, path }) {
  const specPath = path?.replace(/(?:spec|feature-tcs)\.md$/, "spec.md");
  const id = path ? (
    <a className="trace-marker-id" href={docHref(path, marker.id)}>{marker.id}</a>
  ) : (
    <span className="trace-marker-id trace-marker-id-muted">{marker.id}</span>
  );

  return (
    <div className="trace-marker" id={marker.id}>
      <span className="trace-marker-label">
        {marker.kind === "case" ? "Test case" : "Scenario"}
      </span>
      {id}
      <span className="trace-marker-revision">rev {marker.revision}</span>
      {marker.covers.length > 0 && (
        <div className="trace-marker-covers">
          <span className="trace-marker-label">Covers</span>
          {marker.covers.map((covered) =>
            specPath ? (
              <a key={covered} className="trace-marker-id" href={docHref(specPath, covered)}>
                {covered}
              </a>
            ) : (
              <span key={covered} className="trace-marker-id trace-marker-id-muted">
                {covered}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
