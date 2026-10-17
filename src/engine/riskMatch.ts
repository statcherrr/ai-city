/**
 * Risk matching: match ml risk_scores.json segments to the city's street graph.
 * Uses both name-based matching and geospatial proximity (centroid distance).
 * Unmatched segments are counted for the console.
 */

/** Match result for a single risk score segment. */
export interface RiskMatchResult {
  /** The graph edge key if matched, empty if unmatched. */
  edgeKey: string;
  /** The corresponding graph edge, if found. */
  edge?: {
    a: number;
    b: number;
    key: string;
    axis: 'ew' | 'ns';
    length: number;
    bridge: boolean;
  };
  /** Risk score from the model (0-1). */
  riskScore: number;
  /** Top 3 factors from the model. */
  topFactors: { feature: string; importance: number; note: string }[];
  /** Matched street name. */
  streetName: string;
  /** Cross street from (fromCross). */
  fromCross: string;
  /** Cross street to (toCross). */
  toCross: string;
  /** Match method: 'name' | 'geo' | 'none' */
  matchMethod: 'name' | 'geo' | 'none';
}

/** Haversine distance in meters between two lat/lon points. */
function haversineLatLon(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Convert world coordinates to lat/lon (approximate for the procedural city).
 * The city is centered at lat=40.758, lon=-73.985 (Midtown Manhattan approximate center).
 * Each world unit ≈ 12.5 meters (BLOCK=8 world units = 100m real).
 */
function worldToLatLon(x: number, z: number): { lat: number; lon: number } {
  const centerLat = 40.758;
  const centerLon = -73.985;
  const metersPerUnit = 12.5; // BLOCK=8 → 100m, so 12.5 m/unit

  // Approximate: 1 degree lat ≈ 111,000 m, 1 degree lon ≈ 111,000 * cos(lat) m
  const latPerMeter = 1 / 111000;
  const lonPerMeter = 1 / (111000 * Math.cos((centerLat * Math.PI) / 180));

  return {
    lat: centerLat + x * metersPerUnit * latPerMeter,
    lon: centerLon + z * metersPerUnit * lonPerMeter,
  };
}

/** Get the centroid of a graph edge in lat/lon. */
function edgeCentroid(
  edge: { a: number; b: number; axis: 'ew' | 'ns' },
  worldX: (i: number) => number,
  worldZ: (j: number) => number
): { lat: number; lon: number } {
  const iA = edge.a % 21;
  const iB = edge.b % 21;
  const jA = Math.floor(edge.a / 21);
  const jB = Math.floor(edge.b / 21);
  const x = (worldX(iA) + worldX(iB)) / 2;
  const z = (worldZ(jA) + worldZ(jB)) / 2;
  return worldToLatLon(x, z);
}

/** Match a single risk score segment to a graph edge. */
export function matchRiskSegment(
  segment: {
    segmentId: string;
    streetName: string;
    fromCross: string;
    toCross: string;
    riskScore: number;
    topFactors: { feature: string; importance: number; note: string }[];
    centroid: { lat: number; lon: number };
    polyline: number[][];
  },
  graphEdges: ReadonlyArray<{
    a: number;
    b: number;
    key: string;
    axis: 'ew' | 'ns';
    length: number;
    bridge: boolean;
  }>
): RiskMatchResult {
  const nameUpper = segment.streetName.toUpperCase();

  // Strategy 1: Name-based matching
  let matchedEdge: typeof graphEdges[0] | undefined;
  let edgeKey = '';
  let matchMethod: 'name' | 'geo' | 'none' = 'none';

  // Normalize the street name for matching
  const normalizedName = normalizeStreetName(nameUpper);

  // Try to find an edge matching this street name
  for (const edge of graphEdges) {
    const edgeName = getEdgeName(edge);
    const normalizedEdgeName = normalizeStreetName(edgeName.toUpperCase());

    if (normalizedName === normalizedEdgeName) {
      matchedEdge = edge;
      edgeKey = edge.key;
      matchMethod = 'name';
      break;
    }
  }

  // Strategy 2: Geospatial proximity matching (if name matching failed)
  if (!matchedEdge && segment.centroid) {
    let bestEdge: typeof graphEdges[0] | undefined;
    let bestDistance = Infinity;

    for (const edge of graphEdges) {
      const edgeLatLon = edgeCentroid(edge, (i: number) => i * 8 - 80, (j: number) => j * 8 - 80);
      const dist = haversineLatLon(
        segment.centroid.lat, segment.centroid.lon,
        edgeLatLon.lat, edgeLatLon.lon
      );
      if (dist < bestDistance) {
        bestDistance = dist;
        bestEdge = edge;
      }
    }

    // Match if within 200 meters (about 1.6 city blocks)
    if (bestEdge && bestDistance < 200) {
      matchedEdge = bestEdge;
      edgeKey = bestEdge.key;
      matchMethod = 'geo';
    }
  }

  if (matchedEdge) {
    return {
      edgeKey,
      edge: matchedEdge,
      riskScore: segment.riskScore,
      topFactors: segment.topFactors,
      streetName: segment.streetName,
      fromCross: segment.fromCross,
      toCross: segment.toCross,
      matchMethod,
    };
  }

  // No match found
  return {
    edgeKey: '',
    riskScore: segment.riskScore,
    topFactors: segment.topFactors,
    streetName: segment.streetName,
    fromCross: segment.fromCross,
    toCross: segment.toCross,
    matchMethod: 'none',
  };
}

/** Normalize street names for matching (handle ordinals, aliases, etc.). */
function normalizeStreetName(name: string): string {
  let n = name.toUpperCase().trim();

  // CONVERT AVENUE → AVE, STREET → ST
  n = n.replace(/\s+AVENUE$/, ' AVE');
  n = n.replace(/\s+STREET$/, ' ST');

  // NORMALIZE ORDINALS: 7TH AVE → 7 AVE, 3RD AVE → 3 AVE, etc.
  // Use regex with word boundary to handle "7TH AVE" → "7 AVE"
  n = n.replace(/(\d+)(TH|ND|RD|ST)\s+AVE/, '$1 AVE');
  n = n.replace(/(\d+)(TH|ND|RD|ST)\s+ST/, '$1 ST');

  return n;
}

/** Get a street name for a graph edge based on its position. */
function getEdgeName(edge: { a: number; b: number; axis: 'ew' | 'ns' }): string {
  const iA = edge.a % 21;
  const iB = edge.b % 21;
  const jA = Math.floor(edge.a / 21);
  const jB = Math.floor(edge.b / 21);
  void iB; void jA; void jB;

  if (edge.axis === 'ew') {
    const streetNum = 34 + iA;
    return `${streetNum} ST`;
  }

  if (edge.axis === 'ns') {
    const avenueNum = 3 + iA;
    return `${avenueNum} AVE`;
  }

  return 'UNKNOWN';
}

/** Match all risk score segments to graph edges and return results + unmatched count. */
export function matchAllRiskSegments(
  segments: Array<{
    segmentId: string;
    streetName: string;
    fromCross: string;
    toCross: string;
    riskScore: number;
    topFactors: { feature: string; importance: number; note: string }[];
    centroid: { lat: number; lon: number };
    polyline: number[][];
  }>,
  graphEdges: ReadonlyArray<{
    a: number;
    b: number;
    key: string;
    axis: 'ew' | 'ns';
    length: number;
    bridge: boolean;
  }>
): RiskMatchResult[] {
  const results: RiskMatchResult[] = [];

  for (const segment of segments) {
    const result = matchRiskSegment(segment, graphEdges);
    results.push(result);
  }

  return results;
}