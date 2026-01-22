
import OpenAI from 'openai';
import { EnrichedCandidate } from './react-agent.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// INTERFACES
// ============================================================================

export interface VenueSelectionConfig {
  targetCount: number;
  maxMustHaves: number;
  minMustHaves: number;
  maxWalkingDistanceKm: number;
  corridorWidthKm: number;
}

export interface VenueSelectionResult {
  success: boolean;
  selectedVenues: EnrichedCandidate[];
  mustHavesSelected: number;
  niceToHavesSelected: number;
  clusterCenter: { lat: number; lng: number };
  clusterRadiusKm: number;
  reasoning: string;
  selectionMode: 'cluster' | 'corridor';
  alternativesMap: Record<string, EnrichedCandidate[]>;  // 🆕 placeId → alternatives
}

interface VenueWithDistance extends EnrichedCandidate {
  distanceToCenter?: number;
}

interface IntentFilterResult {
  isFocusedQuery: boolean;
  allowedCategories: string[];
  reasoning: string;
}

// ============================================================================
// INTENT FILTER - LLM-based category filtering
// ============================================================================

async function analyzeUserIntent(userPrompt: string): Promise<IntentFilterResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You analyze travel queries to determine venue filtering.

        Return JSON:
        {
          "queryType": "explicit_venues" | "focused_type" | "exploratory",
          "allowedCategories": string[],
          "explicitVenues": string[],
          "reasoning": string
        }
        
        RULES:
        1. explicit_venues = User names SPECIFIC places (Starbucks, MIT, Northeastern)
           → Extract venue names, return ONLY those
        2. focused_type = User wants a TYPE of venue (restaurants, bars, cafes)
           → Filter to that category
        3. exploratory = User wants variety (things to do, date night, day out)
           → Allow all
        
        EXAMPLES:
        "Plan a route from my location to Northeastern University to starbucks near MIT"
        → {"queryType": "explicit_venues", "explicitVenues": ["Northeastern University", "Starbucks near MIT"], "allowedCategories": [], "reasoning": "User named specific destinations"}
        
        "indian restaurants between MIT and harvard"
        → {"queryType": "focused_type", "explicitVenues": [], "allowedCategories": ["restaurant", "food"], "reasoning": "User wants restaurant recommendations"}
        
        "things to do in boston"
        → {"queryType": "exploratory", "explicitVenues": [], "allowedCategories": [], "reasoning": "User wants variety"}`
              },
      {
        role: 'user',
        content: userPrompt
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from intent analyzer');
  }
  
  return JSON.parse(content) as IntentFilterResult;
}

async function filterCandidatesByIntent(
  userPrompt: string,
  candidates: EnrichedCandidate[]
): Promise<EnrichedCandidate[]> {
  
  console.log('\n🔍 INTENT FILTER: Analyzing user intent...');
  
  try {
    const filterResult = await analyzeUserIntent(userPrompt);
    
    console.log(`   Focused query: ${filterResult.isFocusedQuery}`);
    console.log(`   Allowed categories: ${filterResult.allowedCategories.length > 0 ? filterResult.allowedCategories.join(', ') : 'ALL'}`);
    console.log(`   Reasoning: ${filterResult.reasoning}`);
    
    if (!filterResult.isFocusedQuery || filterResult.allowedCategories.length === 0) {
      console.log('   ✅ Exploratory query - keeping all candidates');
      return candidates;
    }
    
    const filtered = candidates.filter(candidate => {
      const candidateCategory = (candidate.category || '').toLowerCase();
      const candidateTypes = (candidate.types || []).map(t => t.toLowerCase());
      
      return filterResult.allowedCategories.some(allowed => {
        const lowerAllowed = allowed.toLowerCase();
        return candidateCategory.includes(lowerAllowed) ||
               candidateTypes.some(t => t.includes(lowerAllowed));
      });
    });
    
    console.log(`   📊 Filtered: ${candidates.length} → ${filtered.length} candidates`);
    
    if (filtered.length < 3) {
      console.log('   ⚠️ Too few results after filter, keeping original candidates');
      return candidates;
    }
    
    return filtered;
    
  } catch (error) {
    console.error('   ❌ Intent filter error:', error);
    return candidates;
  }
}

// ============================================================================
// VENUE SELECTOR CLASS
// ============================================================================

export class VenueSelector {
  private config: VenueSelectionConfig;

  constructor(config?: Partial<VenueSelectionConfig>) {
    this.config = {
      targetCount: config?.targetCount || 6,
      maxMustHaves: config?.maxMustHaves || 5,  // 🆕 Increased from 3
      minMustHaves: config?.minMustHaves || 2,
      maxWalkingDistanceKm: config?.maxWalkingDistanceKm || 1.5,
      corridorWidthKm: config?.corridorWidthKm || 1.0,
    };
  }

  // ==========================================================================
  // MAIN ENTRY POINT - Auto-detects cluster vs corridor
  // ==========================================================================
  async selectVenuesWithMode(
    candidates: EnrichedCandidate[],
    options: {
      userRequestedCount?: number;
      corridorStart?: { lat: number; lng: number };
      corridorEnd?: { lat: number; lng: number };
      isCorridorQuery?: boolean;
      userPrompt?: string;
    }
  ): Promise<VenueSelectionResult> {
    const { corridorStart, corridorEnd, isCorridorQuery, userPrompt } = options;
    
    // 🆕 Filter by user intent BEFORE geographic selection
    let filteredCandidates = candidates;
    if (userPrompt) {
      filteredCandidates = await filterCandidatesByIntent(userPrompt, candidates);
    }
    
    if (isCorridorQuery && corridorStart && corridorEnd) {
      console.log('🛤️ CORRIDOR MODE: Selecting venues along route');
      return this.selectAlongCorridor(
        filteredCandidates, 
        corridorStart, 
        corridorEnd,
        options.userRequestedCount
      );
    }
    
    console.log('📍 CLUSTER MODE: Selecting walkable cluster');
    return this.selectVenuesInternal(filteredCandidates, options.userRequestedCount);
  }

  // ==========================================================================
  // CORRIDOR SELECTION - Venues along a path from A to B
  // ==========================================================================
  selectAlongCorridor(
    candidates: EnrichedCandidate[],
    start: { lat: number; lng: number },
    end: { lat: number; lng: number },
    targetCount?: number
  ): VenueSelectionResult {
    console.log('\n🛤️ CORRIDOR SELECTOR: Selecting venues along route');
    console.log(`   Start: (${start.lat.toFixed(4)}, ${start.lng.toFixed(4)})`);
    console.log(`   End: (${end.lat.toFixed(4)}, ${end.lng.toFixed(4)})`);
    console.log(`   Candidates: ${candidates.length}`);
    
    const count = targetCount || this.config.targetCount;
    const corridorWidthKm = this.config.corridorWidthKm;
    
    const corridorLengthKm = this.haversineDistance(
      start.lat, start.lng, end.lat, end.lng
    );
    console.log(`   Corridor length: ${corridorLengthKm.toFixed(2)} km`);
    
    const scoredVenues = candidates.map(venue => {
      const projection = this.projectPointOntoLine(venue.location, start, end);
      return {
        ...venue,
        corridorPosition: projection.t,
        distanceFromCorridor: projection.distance,
        isWithinCorridor: projection.distance <= corridorWidthKm
      };
    });
    
    const inCorridor = scoredVenues.filter(v => v.isWithinCorridor);
    console.log(`   Within ${corridorWidthKm}km of corridor: ${inCorridor.length} venues`);
    
    if (inCorridor.length === 0) {
      console.log('   ⚠️ No venues in corridor, falling back to cluster mode');
      return this.selectVenuesInternal(candidates, count);
    }
    
    inCorridor.sort((a, b) => a.corridorPosition - b.corridorPosition);
    
    const selected = this.selectEvenlyDistributed(inCorridor, count);
    
    const cleanedVenues = selected.map(({ 
      corridorPosition, distanceFromCorridor, isWithinCorridor, ...venue 
    }) => venue as EnrichedCandidate);
    
    // 🆕 Build alternatives from unselected corridor venues
    const selectedPlaceIds = new Set(cleanedVenues.map(v => v.placeId));
    const unselected = inCorridor
      .filter(v => !selectedPlaceIds.has(v.placeId))
      .map(({ corridorPosition, distanceFromCorridor, isWithinCorridor, ...venue }) => venue as EnrichedCandidate);
    
    const alternativesMap = this.buildAlternativesMap(cleanedVenues, unselected);
    
    const center = this.calculateCentroid(cleanedVenues);
    const radius = this.calculateClusterRadius(cleanedVenues, center);
    
    const mustHaveCount = cleanedVenues.filter(v => v.priority === 'must_have').length;
    const niceToHaveCount = cleanedVenues.filter(v => v.priority === 'nice_to_have').length;
    
    console.log(`   ✅ Selected ${cleanedVenues.length} venues along corridor`);
    console.log(`   Route: ${cleanedVenues.map(v => v.name).join(' → ')}`);
    console.log(`   🔄 Alternatives: ${Object.values(alternativesMap).flat().length} total`);
    
    return {
      success: true,
      selectedVenues: cleanedVenues,
      mustHavesSelected: mustHaveCount,
      niceToHavesSelected: niceToHaveCount,
      clusterCenter: center,
      clusterRadiusKm: radius,
      reasoning: `Selected ${cleanedVenues.length} venues along ${corridorLengthKm.toFixed(1)}km corridor`,
      selectionMode: 'corridor',
      alternativesMap
    };
  }

  // ==========================================================================
  // CLUSTER SELECTION (with optional intent filtering)
  // ==========================================================================
  async selectVenues(
    candidates: EnrichedCandidate[],
    userRequestedCount?: number,
    userPrompt?: string
  ): Promise<VenueSelectionResult> {
    // 🆕 Filter by user intent if prompt provided
    let filteredCandidates = candidates;
    if (userPrompt) {
      filteredCandidates = await filterCandidatesByIntent(userPrompt, candidates);
    }
    
    return this.selectVenuesInternal(filteredCandidates, userRequestedCount);
  }

  // ==========================================================================
  // INTERNAL CLUSTER SELECTION (no filtering, used by other methods)
  // ==========================================================================
  private selectVenuesInternal(
    candidates: EnrichedCandidate[],
    userRequestedCount?: number
  ): VenueSelectionResult {
    console.log('\n🎯 VENUE SELECTOR: Starting geographic optimization');
    console.log(`   Input: ${candidates.length} candidates`);
    
    const targetCount = userRequestedCount || this.config.targetCount;
    console.log(`   Target: ${targetCount} venues`);
    
    const mustHaves = candidates.filter(c => c.priority === 'must_have');
    const niceToHaves = candidates.filter(c => c.priority === 'nice_to_have');
    
    console.log(`   🎯 Must-haves available: ${mustHaves.length}`);
    console.log(`   ✨ Nice-to-haves available: ${niceToHaves.length}`);
    
    // 🆕 If all candidates are same priority (after filtering), select from all
    if (mustHaves.length === 0) {
      console.log('   ⚠️ No must-haves! Selecting from nice-to-haves only');
      return this.selectFromSingleCategory(niceToHaves, targetCount);
    }
    
    if (niceToHaves.length === 0) {
      console.log('   ℹ️ Only must-haves available, selecting from them');
      return this.selectFromSingleCategory(mustHaves, targetCount);
    }
    
    // 🆕 Adjust must-have count based on target
    const mustHaveTarget = Math.min(
      mustHaves.length,
      Math.max(this.config.minMustHaves, Math.ceil(targetCount * 0.6))  // 60% must-haves
    );
    
    const selectedMustHaves = this.selectTightestCluster(mustHaves, mustHaveTarget);
    
    console.log(`\n   📍 Selected ${selectedMustHaves.length} must-haves:`);
    selectedMustHaves.forEach(v => console.log(`      - ${v.name}`));
    
    const clusterCenter = this.calculateCentroid(selectedMustHaves);
    console.log(`   📍 Cluster center: (${clusterCenter.lat.toFixed(4)}, ${clusterCenter.lng.toFixed(4)})`);
    
    const niceToHavesWithDistance: VenueWithDistance[] = niceToHaves.map(venue => ({
      ...venue,
      distanceToCenter: this.haversineDistance(
        clusterCenter.lat, clusterCenter.lng,
        venue.location.lat, venue.location.lng
      )
    }));
    
    niceToHavesWithDistance.sort((a, b) => 
      (a.distanceToCenter || Infinity) - (b.distanceToCenter || Infinity)
    );
    
    const remainingSlots = targetCount - selectedMustHaves.length;
    const selectedNiceToHaves = niceToHavesWithDistance.slice(0, remainingSlots);
    
    console.log(`\n   ✨ Selected ${selectedNiceToHaves.length} nice-to-haves:`);
    selectedNiceToHaves.forEach(v => 
      console.log(`      - ${v.name} (${(v.distanceToCenter || 0).toFixed(2)}km from center)`)
    );
    
    const selectedVenues: EnrichedCandidate[] = [
      ...selectedMustHaves,
      ...selectedNiceToHaves.map(v => {
        const { distanceToCenter, ...venue } = v;
        return venue;
      })
    ];
    
    // 🆕 Build alternatives from unselected candidates
    const selectedPlaceIds = new Set(selectedVenues.map(v => v.placeId));
    const unselectedMustHaves = mustHaves.filter(v => !selectedPlaceIds.has(v.placeId));
    const unselectedNiceToHaves = niceToHavesWithDistance
      .slice(remainingSlots)
      .map(v => { const { distanceToCenter, ...venue } = v; return venue; });
    
    const allUnselected = [...unselectedMustHaves, ...unselectedNiceToHaves];
    const alternativesMap = this.buildAlternativesMap(selectedVenues, allUnselected);
    
    const clusterRadiusKm = this.calculateClusterRadius(selectedVenues, clusterCenter);
    
    const reasoning = this.buildReasoning(
      selectedMustHaves.length,
      selectedNiceToHaves.length,
      clusterRadiusKm
    );
    
    console.log(`\n   ✅ SELECTION COMPLETE`);
    console.log(`   Total selected: ${selectedVenues.length}`);
    console.log(`   Cluster radius: ${clusterRadiusKm.toFixed(2)}km`);
    console.log(`   🔄 Alternatives: ${Object.values(alternativesMap).flat().length} total`);
    console.log(`   ${reasoning}`);
    
    return {
      success: true,
      selectedVenues,
      mustHavesSelected: selectedMustHaves.length,
      niceToHavesSelected: selectedNiceToHaves.length,
      clusterCenter,
      clusterRadiusKm,
      reasoning,
      selectionMode: 'cluster',
      alternativesMap
    };
  }

  // ==========================================================================
  // 🆕 BUILD ALTERNATIVES MAP - Group by nearest selected venue
  // ==========================================================================
  private buildAlternativesMap(
    selectedVenues: EnrichedCandidate[],
    unselectedCandidates: EnrichedCandidate[]
  ): Record<string, EnrichedCandidate[]> {
    const alternativesMap: Record<string, EnrichedCandidate[]> = {};
    
    if (unselectedCandidates.length === 0 || selectedVenues.length === 0) {
      return alternativesMap;
    }
    
    // Initialize empty arrays for each selected venue
    selectedVenues.forEach(v => {
      alternativesMap[v.placeId] = [];
    });
    
    // Assign each unselected candidate to nearest selected venue
    unselectedCandidates.forEach(candidate => {
      let nearestPlaceId = selectedVenues[0].placeId;
      let nearestDistance = Infinity;
      
      selectedVenues.forEach(selected => {
        const dist = this.haversineDistance(
          candidate.location.lat, candidate.location.lng,
          selected.location.lat, selected.location.lng
        );
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestPlaceId = selected.placeId;
        }
      });
      
      // Limit to 3 alternatives per venue
      if (alternativesMap[nearestPlaceId].length < 3) {
        alternativesMap[nearestPlaceId].push(candidate);
      }
    });
    
    // Remove empty entries
    Object.keys(alternativesMap).forEach(key => {
      if (alternativesMap[key].length === 0) {
        delete alternativesMap[key];
      }
    });
    
    return alternativesMap;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private selectTightestCluster(venues: EnrichedCandidate[], count: number): EnrichedCandidate[] {
    if (venues.length <= count) return venues;
    
    const distances: number[][] = [];
    for (let i = 0; i < venues.length; i++) {
      distances[i] = [];
      for (let j = 0; j < venues.length; j++) {
        distances[i][j] = i === j ? 0 : this.haversineDistance(
          venues[i].location.lat, venues[i].location.lng,
          venues[j].location.lat, venues[j].location.lng
        );
      }
    }
    
    let minDist = Infinity, startI = 0, startJ = 1;
    for (let i = 0; i < venues.length; i++) {
      for (let j = i + 1; j < venues.length; j++) {
        if (distances[i][j] < minDist) {
          minDist = distances[i][j];
          startI = i;
          startJ = j;
        }
      }
    }
    
    const selected = new Set<number>([startI, startJ]);
    
    while (selected.size < count) {
      let bestCandidate = -1, bestAvgDist = Infinity;
      
      for (let i = 0; i < venues.length; i++) {
        if (selected.has(i)) continue;
        let totalDist = 0;
        selected.forEach(s => totalDist += distances[i][s]);
        const avgDist = totalDist / selected.size;
        if (avgDist < bestAvgDist) {
          bestAvgDist = avgDist;
          bestCandidate = i;
        }
      }
      
      if (bestCandidate >= 0) selected.add(bestCandidate);
      else break;
    }
    
    return Array.from(selected).map(i => venues[i]);
  }

  private selectFromSingleCategory(venues: EnrichedCandidate[], count: number): VenueSelectionResult {
    const selected = this.selectTightestCluster(venues, count);
    const center = this.calculateCentroid(selected);
    const radius = this.calculateClusterRadius(selected, center);
    
    // 🆕 Build alternatives from unselected
    const selectedPlaceIds = new Set(selected.map(v => v.placeId));
    const unselected = venues.filter(v => !selectedPlaceIds.has(v.placeId));
    const alternativesMap = this.buildAlternativesMap(selected, unselected);
    
    return {
      success: true,
      selectedVenues: selected,
      mustHavesSelected: selected.filter(v => v.priority === 'must_have').length,
      niceToHavesSelected: selected.filter(v => v.priority === 'nice_to_have').length,
      clusterCenter: center,
      clusterRadiusKm: radius,
      reasoning: `Selected ${selected.length} venues forming a tight cluster (${radius.toFixed(2)}km radius)`,
      selectionMode: 'cluster',
      alternativesMap
    };
  }

  private projectPointOntoLine(
    point: { lat: number; lng: number },
    lineStart: { lat: number; lng: number },
    lineEnd: { lat: number; lng: number }
  ): { t: number; distance: number } {
    const latScale = 111.32;
    const lngScale = 111.32 * Math.cos((lineStart.lat * Math.PI) / 180);
    
    const ax = lineStart.lng * lngScale, ay = lineStart.lat * latScale;
    const bx = lineEnd.lng * lngScale, by = lineEnd.lat * latScale;
    const px = point.lng * lngScale, py = point.lat * latScale;
    
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    
    if (abLenSq === 0) return { t: 0, distance: Math.sqrt(apx * apx + apy * apy) };
    
    let t = (apx * abx + apy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = ax + t * abx, closestY = ay + t * aby;
    const dx = px - closestX, dy = py - closestY;
    
    return { t, distance: Math.sqrt(dx * dx + dy * dy) };
  }

  private selectEvenlyDistributed(sortedVenues: any[], count: number): any[] {
    if (sortedVenues.length <= count) return sortedVenues;
    
    const selected: any[] = [];
    const step = (sortedVenues.length - 1) / (count - 1);
    
    for (let i = 0; i < count; i++) {
      selected.push(sortedVenues[Math.round(i * step)]);
    }
    
    return selected;
  }

  private calculateCentroid(venues: EnrichedCandidate[]): { lat: number; lng: number } {
    if (venues.length === 0) return { lat: 0, lng: 0 };
    const sum = venues.reduce((acc, v) => ({
      lat: acc.lat + v.location.lat,
      lng: acc.lng + v.location.lng
    }), { lat: 0, lng: 0 });
    return { lat: sum.lat / venues.length, lng: sum.lng / venues.length };
  }

  private calculateClusterRadius(venues: EnrichedCandidate[], center: { lat: number; lng: number }): number {
    let maxDist = 0;
    venues.forEach(v => {
      const dist = this.haversineDistance(center.lat, center.lng, v.location.lat, v.location.lng);
      if (dist > maxDist) maxDist = dist;
    });
    return maxDist;
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(this.toRad(lat1))*Math.cos(this.toRad(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  private toRad(deg: number): number { return deg * (Math.PI / 180); }

  private buildReasoning(mustHaveCount: number, niceToHaveCount: number, radiusKm: number): string {
    const walkability = radiusKm <= 0.5 ? 'highly walkable' :
                        radiusKm <= 1.0 ? 'walkable' :
                        radiusKm <= 2.0 ? 'mostly walkable' : 'spread out';
    return `Selected ${mustHaveCount} core venues + ${niceToHaveCount} complementary stops. Route is ${walkability} (${radiusKm.toFixed(2)}km radius).`;
  }
}

export const venueSelector = new VenueSelector();