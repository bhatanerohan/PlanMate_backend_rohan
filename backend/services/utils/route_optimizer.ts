// backend/services/utils/route-optimizer.ts
// Enhanced Nearest Neighbor with Multi-Start Optimization

export interface Waypoint {
  lat: number;
  lng: number;
}

export interface OptimizationResult {
  optimizedOrder: number[];
  optimizedWaypoints: Array<{ lat: number; lng: number; originalIndex: number }>;
  totalDistance: number;
  totalDuration: number;
  startingPoint: number;
  improvement?: {
    originalDistance: number;
    percentImproved: number;
  };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(coord1: Waypoint, coord2: Waypoint): number {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (coord1.lat * Math.PI) / 180;
  const lat2Rad = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate total route distance for a given order
 */
export function calculateRouteDistance(waypoints: Waypoint[], order: number[]): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += haversineDistance(waypoints[order[i]], waypoints[order[i + 1]]);
  }
  return total;
}

/**
 * Single-start Nearest Neighbor Algorithm
 * Used internally - tries optimization from one starting point
 */
function nearestNeighborFromStart(
  waypoints: Waypoint[],
  startIndex: number
): { order: number[]; distance: number } {
  const n = waypoints.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];
  let totalDistance = 0;
  let current = startIndex;

  visited[current] = true;
  order.push(current);

  for (let step = 1; step < n; step++) {
    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < n; i++) {
      if (!visited[i]) {
        const dist = haversineDistance(waypoints[current], waypoints[i]);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      }
    }

    if (nearest !== -1) {
      visited[nearest] = true;
      order.push(nearest);
      totalDistance += nearestDist;
      current = nearest;
    }
  }

  return { order, distance: totalDistance };
}

/**
 * Multi-Start Nearest Neighbor Algorithm
 * 
 * Tries starting from EVERY waypoint and returns the best route.
 * This solves the problem of suboptimal starting points.
 * 
 * Time Complexity: O(n³) - but fast for typical itineraries (5-15 venues)
 */
export function nearestNeighborOptimization(
  waypoints: Waypoint[],
  fixedStartIndex?: number // Optional: force start from specific index (e.g., user location)
): OptimizationResult {
  console.log(`🔄 [NearestNeighbor] Optimizing ${waypoints.length} waypoints`);

  if (waypoints.length < 2) {
    return {
      optimizedOrder: waypoints.map((_, i) => i),
      optimizedWaypoints: waypoints.map((wp, i) => ({ ...wp, originalIndex: i })),
      totalDistance: 0,
      totalDuration: 0,
      startingPoint: 0
    };
  }

  const n = waypoints.length;
  const originalDistance = calculateRouteDistance(waypoints, waypoints.map((_, i) => i));
  
  let bestOrder: number[] = [];
  let bestDistance = Infinity;
  let bestStartIndex = 0;

  // If fixed start is provided (e.g., user location), only try that
  // Otherwise, try ALL starting points
  const startIndicesToTry = fixedStartIndex !== undefined 
    ? [fixedStartIndex] 
    : Array.from({ length: n }, (_, i) => i);

  console.log(`   Testing ${startIndicesToTry.length} starting point(s)...`);

  for (const startIdx of startIndicesToTry) {
    const result = nearestNeighborFromStart(waypoints, startIdx);
    
    if (result.distance < bestDistance) {
      bestDistance = result.distance;
      bestOrder = result.order;
      bestStartIndex = startIdx;
    }
  }

  // Build optimized waypoints array
  const optimizedWaypoints = bestOrder.map(idx => ({
    lat: waypoints[idx].lat,
    lng: waypoints[idx].lng,
    originalIndex: idx
  }));

  // Estimate walking duration (average walking speed: 5 km/h = 1.39 m/s)
  const WALKING_SPEED_MS = 1.39;
  const totalDuration = bestDistance / WALKING_SPEED_MS;

  const percentImproved = ((originalDistance - bestDistance) / originalDistance * 100);

  console.log(`✅ [NearestNeighbor] Optimization complete`);
  console.log(`   Best starting point: waypoint ${bestStartIndex}`);
  console.log(`   Original order: [${waypoints.map((_, i) => i).join(' → ')}]`);
  console.log(`   Optimized order: [${bestOrder.join(' → ')}]`);
  console.log(`   Original distance: ${(originalDistance / 1000).toFixed(2)} km`);
  console.log(`   Optimized distance: ${(bestDistance / 1000).toFixed(2)} km`);
  console.log(`   Improvement: ${percentImproved.toFixed(1)}%`);
  console.log(`   Est. walking time: ${Math.round(totalDuration / 60)} minutes`);

  return {
    optimizedOrder: bestOrder,
    optimizedWaypoints,
    totalDistance: bestDistance,
    totalDuration,
    startingPoint: bestStartIndex,
    improvement: {
      originalDistance,
      percentImproved
    }
  };
}

/**
 * Optimize with user location as fixed starting point
 * Use this when the user's current location should be the start
 */
export function optimizeFromUserLocation(
  waypoints: Waypoint[],
  userLocationIndex: number = 0
): OptimizationResult {
  console.log(`📍 [NearestNeighbor] Optimizing with fixed start at user location (index ${userLocationIndex})`);
  return nearestNeighborOptimization(waypoints, userLocationIndex);
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 0.1 ? `${Math.round(meters)}m` : `${miles.toFixed(1)} mi`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}