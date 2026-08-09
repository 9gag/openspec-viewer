import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { useEffect } from "react";

import { useApi } from "../api.js";
import { Artifact } from "../components/bits.jsx";
import WithOutline from "../components/WithOutline.jsx";
import { splitDocArg } from "../links.js";

/**
 * A markdown file in the store that is not an OpenSpec artifact — a PRD, a governance
 * doc, a README.
 *
 * Reached by following a link out of a spec rather than from the nav, because that is
 * the only way anyone arrives: these documents have no id and no index, and the store's
 * own cross-references are what give them an address. So there is no side-nav entry,
 * and going back is the browser's job.
 */
export default function DocDetail({ id }) {
  const { path, fragment } = splitDocArg(id);
  const { data, error, loading } = useApi(
    `/api/doc?path=${encodeURIComponent(path)}`,
    { poll: false },
  );

  // A link may name a heading inside the document. The ids come from the markdown
  // renderer, so the element only exists once the body has rendered — hence the effect
  // on `data` rather than a scroll at navigation time.
  useEffect(() => {
    if (!data || !fragment) return;
    document.getElementById(fragment)?.scrollIntoView({ block: "start" });
  }, [data, fragment]);

  if (loading) return <Spinner label={`Reading ${path}`} />;

  if (error) {
    return (
      <VStack gap={4}>
        <BackLink />
        <Banner
          status="error"
          container="card"
          title={`Cannot read ${path}`}
          description={error}
        />
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <BackLink />
        <Heading level={1}>{data.title}</Heading>
        <Text size="sm" color="secondary">
          A document in the store, outside <span className="mono">openspec/</span>
          . Nothing here is normative: the requirement it explains lives in a
          capability spec.
        </Text>
      </VStack>

      <WithOutline>
        <Card padding={4}>
          <Artifact text={data.text} path={data.path} commit={data.commit} />
        </Card>
      </WithOutline>
    </VStack>
  );
}

/**
 * No href: Astryx renders a link-styled `<button>` when one is absent, which is the
 * honest element for something that moves through history rather than to an address.
 */
function BackLink() {
  return <Link onClick={() => window.history.back()}>← Back</Link>;
}
