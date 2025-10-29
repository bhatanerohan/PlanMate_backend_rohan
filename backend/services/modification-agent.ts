// backend/services/modification-agent.ts - COMPLETE FIXED VERSION

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { getGooglePlacesClient } from './api-clients/google-places.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ModificationOperation {
  type: 'ADD' | 'REMOVE' | 'REPLACE';
  venues?: (string | VenueSearchSpec)[];
  positions?: string[];
  targetVenues?: string[];
  replaceWith?: (string | VenueSearchSpec)[];
}

export interface VenueSearchSpec {
  name: string;
  searchStrategy: 'near_place' | 'near_user' | 'near_existing' | 'in_city';
  referencePlace?: string;
}

export interface CurrentItinerary {
  venues: any[];
  originalPrompt: string;
  mode: 'route' | 'discovery';
  userLocationIndex?: number;
  hasUserLocation?: boolean;
  alternativesMap?: Record<string, any[]>;
}

export interface SubOperationResult {
  success: boolean;
  venue?: string;
  position?: number;
  error?: string;
  venueName?: string;
}

export interface ModificationResult {
  success: boolean;
  operations?: ModificationOperation[];
  updatedVenues: any[];
  message: string;
  subResults?: SubOperationResult[];
  partialFailure?: boolean;
  error?: string;
}

export class ModificationAgent {
  
  /**
   * 🆕 Extract city name from user location for search queries
   * Converts "Madrid, Madrid, Spain" → "Madrid"
   */
  private extractCityFromUserLocation(userLocation?: { lat: number; lng: number; name: string }): string | null {
    if (!userLocation || !userLocation.name) {
      return null;
    }
    
    const parts = userLocation.name.split(',').map((p: string) => p.trim());
    
    // Handle different location name formats:
    // "Madrid, Madrid, Spain" → ["Madrid", "Madrid", "Spain"]
    // "Chinatown, New York, New York, United States" → ["Chinatown", "New York", "New York", "United States"]
    // "Boston, Massachusetts, United States" → ["Boston", "Massachusetts", "United States"]
    
    if (parts.length >= 3) {
      // Get city (2nd part) and state/region (3rd part)
      const city = parts[1];
      const state = parts[2];
      
      // Check if state is a short code or country
      const isStateCode = state.length <= 3;
      
      return isStateCode ? `${city}, ${state}` : city;
    } else if (parts.length === 2) {
      // Just city and country: "Paris, France"
      return parts[0];
    } else {
      // Single part or unexpected format
      return parts[0];
    }
  }

  async executeModification(
    userPrompt: string,
    currentItinerary: CurrentItinerary,
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<ModificationResult> {
    console.log('\n🔧 Agent 4: Modification Agent (Phase 3) starting...');
    console.log(`📝 User request: "${userPrompt}"`);
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name}`);
    }

    // Extract embedded venue data if present
    const embeddedVenueMatch = userPrompt.match(/\[VENUE:(.*?)\]$/);
    let embeddedVenue: any = null;
    let cleanPrompt = userPrompt;
    
    if (embeddedVenueMatch) {
      try {
        embeddedVenue = JSON.parse(embeddedVenueMatch[1]);
        cleanPrompt = userPrompt.replace(/\s*\[VENUE:.*?\]$/, '');
        console.log(`✅ Found embedded venue data: ${embeddedVenue.name}`);
        console.log(`   Cleaned prompt: "${cleanPrompt}"`);
      } catch (e) {
        console.warn('⚠️ Failed to parse embedded venue data');
      }
    }

    try {
      const parsed = await this.parseModification(cleanPrompt, currentItinerary);
      
      // Phase 3: Check if multiple operations
      if (Array.isArray(parsed)) {
        console.log(`🎯 Multi-operation detected: ${parsed.length} operations`);
        return await this.executeMultiOperation(parsed, currentItinerary, userLocation, embeddedVenue);
      }
      
      // Single operation (Phase 1/2)
      const operation = parsed as ModificationOperation;
      const isMultiVenue = (operation.venues && operation.venues.length > 1) ||
                          (operation.targetVenues && operation.targetVenues.length > 1);
      
      if (isMultiVenue) {
        console.log(`🎯 Multi-venue operation: ${operation.venues?.length || operation.targetVenues?.length} items`);
      }

      const validation = this.validateOperation(operation, currentItinerary);
      if (!validation.valid) {
        return {
          success: false,
          updatedVenues: currentItinerary.venues,
          message: validation.message || 'Invalid operation',
          error: validation.message
        };
      }

      let result: ModificationResult;
      
      switch (operation.type) {
        case 'ADD':
          result = await this.executeAdd(operation, currentItinerary, userLocation, embeddedVenue);
          break;
        case 'REMOVE':
          result = await this.executeRemove(operation, currentItinerary);
          break;
        case 'REPLACE':
          result = await this.executeReplace(operation, currentItinerary, userLocation, embeddedVenue);
          break;
        default:
          throw new Error(`Unknown operation type`);
      }

      console.log(`✅ Modification complete: ${result.message}`);
      return result;

    } catch (error) {
      console.error('❌ Modification error:', error);
      return {
        success: false,
        updatedVenues: currentItinerary.venues,
        message: error instanceof Error ? error.message : 'Failed to modify itinerary',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async executeMultiOperation(
    operations: ModificationOperation[],
    currentItinerary: CurrentItinerary,
    userLocation?: { lat: number; lng: number; name: string },
    embeddedVenue?: any
  ): Promise<ModificationResult> {
    console.log('\n📊 Executing Multi-Operation Sequence');
    
    let workingItinerary = { ...currentItinerary, venues: [...currentItinerary.venues] };
    const messages: string[] = [];
    const allSubResults: SubOperationResult[] = [];
    let hasFailures = false;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      console.log(`\n🔹 Operation ${i + 1}/${operations.length}: ${op.type}`);
      
      let result: ModificationResult;
      
      try {
        switch (op.type) {
          case 'REMOVE':
            result = await this.executeRemove(op, workingItinerary);
            break;
          case 'REPLACE':
            result = await this.executeReplace(op, workingItinerary, userLocation, embeddedVenue);
            break;
          case 'ADD':
            result = await this.executeAdd(op, workingItinerary, userLocation, embeddedVenue);
            break;
          default:
            throw new Error('Unknown operation');
        }

        if (result.success) {
          workingItinerary.venues = result.updatedVenues;
          messages.push(result.message);
          if (result.subResults) {
            allSubResults.push(...result.subResults);
          }
          if (result.partialFailure) {
            hasFailures = true;
          }
        } else {
          hasFailures = true;
          messages.push(`⚠️ ${result.message}`);
        }

      } catch (error) {
        hasFailures = true;
        messages.push(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const finalMessage = `✅ Completed ${operations.length} operations:\n\n${messages.join('\n\n')}`;
    
    return {
      success: true,
      operations,
      updatedVenues: workingItinerary.venues,
      message: finalMessage,
      subResults: allSubResults,
      partialFailure: hasFailures
    };
  }

  private async parseModification(
    userPrompt: string,
    currentItinerary: CurrentItinerary
  ): Promise<ModificationOperation | ModificationOperation[]> {
    const venueList = currentItinerary.venues
      .map((v, i) => `${i + 1}. ${v.name}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Parse modification commands. Support single or multiple operations. Return valid JSON.

CURRENT ITINERARY:
${venueList}

PHASE 3: Can handle multiple operation types in one command!

=== POSITION SYNTAX ===
- Numbers: "1", "2", "3" (or "stop 1", "stop 2" - both formats work)
- Keywords: "first", "second", "third", "last"
- Relative: "after [venue name]", "before [venue name]"
- Default: "at the end" (for ADD)

IMPORTANT: When user says "stop 8" or "8th stop", extract just the number "8" for the position field.

=== SEARCH STRATEGIES ===
For each venue to ADD or REPLACE, you must specify HOW to search:

1. "near_place": Search near a specific landmark/place
   - Use when user says "near X", "at X", "around X", "close to X"
   - Provide the reference place name
   - Example: "add dunkin near MIT" → referencePlace: "MIT"
   
2. "near_user": Search near user's current location
   - Use when user implies current location or no specific place given
   - Example: "add coffee shop" → near_user
   
3. "near_existing": Search near the venue being replaced (ONLY for REPLACE operations)
   - Use when replacing with a similar type of venue (restaurant→restaurant, cafe→cafe)
   - Use when the replacement is likely to be in the same neighborhood
   - Example: "replace starbucks with dunkin" → near_existing
   
4. "in_city": Search anywhere in the city
   - Use as fallback when no specific location context
   - **CRITICAL FOR REPLACE**: Use when replacing with a well-known landmark, attraction, or venue that might be far away
   - Example: "replace cafe with brooklyn bridge" → in_city (landmarks are far apart)
   - Example: "replace bar with museum of modern art" → in_city (famous places)
   - Example: "replace restaurant with stadium" → in_city (large venues)

**IMPORTANT FOR REPLACE OPERATIONS:**
- If replacing with a well-known landmark, tourist attraction, stadium, or famous place → use "in_city"
- If replacing with a similar business type nearby → use "near_existing"
- If unsure whether replacement is nearby → use "in_city" to search the whole city
- Note: The system has a fallback - if "near_existing" finds nothing, it will automatically retry with "in_city"

IMPORTANT: Pay close attention to spatial references in the user's prompt!
- "near X" / "at X" / "around X" → near_place with referencePlace: "X"
- "close to X" / "by X" → near_place with referencePlace: "X"
- No spatial reference → near_user or in_city

=== EXAMPLES ===

User: "add dunkin near MIT"
Output: {
  "type": "ADD",
  "venues": [{
    "name": "dunkin",
    "searchStrategy": "near_place",
    "referencePlace": "MIT"
  }],
  "positions": ["at the end"]
}

User: "replace bar with cafe"
Output: {
  "type": "REPLACE",
  "targetVenues": ["bar"],
  "replaceWith": [{
    "name": "cafe",
    "searchStrategy": "near_existing"
  }],
  "positions": ["bar"]
}

User: "replace times square with brooklyn bridge"
Output: {
  "type": "REPLACE",
  "targetVenues": ["times square"],
  "replaceWith": [{
    "name": "brooklyn bridge",
    "searchStrategy": "in_city"
  }],
  "positions": ["times square"]
}

User: "replace stop 4 with bernabeau stadium"
Output: {
  "type": "REPLACE",
  "targetVenues": ["stop 4"],
  "replaceWith": [{
    "name": "bernabeau stadium",
    "searchStrategy": "in_city"
  }],
  "positions": ["4"]
}

User: "replace stop 8 with coffee shop"
Output: {
  "type": "REPLACE",
  "targetVenues": ["stop 8"],
  "replaceWith": [{
    "name": "coffee shop",
    "searchStrategy": "near_existing"
  }],
  "positions": ["8"]
}

User: "replace cafe with statue of liberty"
Output: {
  "type": "REPLACE",
  "targetVenues": ["cafe"],
  "replaceWith": [{
    "name": "statue of liberty",
    "searchStrategy": "in_city"
  }],
  "positions": ["cafe"]
}

User: "remove stop 8"
Output: {
  "type": "REMOVE",
  "targetVenues": ["stop 8"],
  "positions": ["8"]
}

User: "remove first and third stops"
Output: {
  "type": "REMOVE",
  "targetVenues": ["first stop", "third stop"],
  "positions": ["first", "third"]
}

=== OUTPUT JSON FORMAT ===

Single operation:
{
  "type": "ADD" | "REMOVE" | "REPLACE",
  "venues": [{ "name": "...", "searchStrategy": "...", "referencePlace": "..." }],
  "positions": ["..."]
}

Multiple operations (return object with "operations" array):
{
  "operations": [
    { "type": "REMOVE", ... },
    { "type": "ADD", ... }
  ]
}

Think carefully about the user's spatial intent and context. Return valid JSON.`
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response');

    const parsed = JSON.parse(content);
    
    if (parsed.operations && Array.isArray(parsed.operations)) {
      return parsed.operations.map((op: any) => this.normalizeOperation(op));
    }
    
    return this.normalizeOperation(parsed);
  }

  private normalizeOperation(parsed: any): ModificationOperation {
    return {
      type: parsed.type,
      venues: Array.isArray(parsed.venues) ? parsed.venues : (parsed.venues ? [parsed.venues] : undefined),
      positions: Array.isArray(parsed.positions) ? parsed.positions : (parsed.positions ? [parsed.positions] : undefined),
      targetVenues: Array.isArray(parsed.targetVenues) ? parsed.targetVenues : (parsed.targetVenue ? [parsed.targetVenue] : parsed.targetVenues ? [parsed.targetVenues] : undefined),
      replaceWith: Array.isArray(parsed.replaceWith) ? parsed.replaceWith : (parsed.replaceWith ? [parsed.replaceWith] : undefined),
    };
  }

  private validateOperation(op: ModificationOperation, itinerary: CurrentItinerary): { valid: boolean; message?: string } {
    if (op.type === 'ADD' && (!op.venues || op.venues.length === 0)) {
      return { valid: false, message: 'Specify venues to add' };
    }
    if (op.type === 'REMOVE') {
      if ((!op.targetVenues || op.targetVenues.length === 0) && (!op.positions || op.positions.length === 0)) {
        return { valid: false, message: 'Specify venues to remove' };
      }
      const removeCount = op.targetVenues?.length || op.positions?.length || 0;
      if (removeCount >= itinerary.venues.length) {
        return { valid: false, message: 'Cannot remove all venues' };
      }
    }
    if (op.type === 'REPLACE') {
      if (!op.targetVenues || op.targetVenues.length === 0) {
        return { valid: false, message: 'Specify venues to replace' };
      }
      if (!op.replaceWith || op.replaceWith.length === 0) {
        return { valid: false, message: 'Specify replacements' };
      }
    }
    return { valid: true };
  }

  private async executeAdd(
    op: ModificationOperation, 
    itinerary: CurrentItinerary, 
    userLocation?: any,
    embeddedVenue?: any
  ): Promise<ModificationResult> {
    const venues = op.venues!;
    console.log(`\n➕ ADD: ${venues.length} venues`);
    console.log(`   User location available: ${userLocation ? 'Yes' : 'No'}`);
    
    // If we have embedded venue data, use it directly!
    if (embeddedVenue && venues.length === 1) {
      console.log(`⚡ Using embedded venue data - SKIPPING Google Places API call`);
      console.log(`   Venue: ${embeddedVenue.name}`);
      console.log(`   PlaceId: ${embeddedVenue.placeId}`);
      
      const updated = [...itinerary.venues];
      updated.push(embeddedVenue);
      
      const msg = `✅ Added venue:\n\n1. 📍 ${embeddedVenue.name}\n   (using cached data - no API call needed)`;
      
      return { 
        success: true, 
        updatedVenues: updated, 
        message: msg,
        subResults: [{ success: true, venue: embeddedVenue.name, position: updated.length - 1, venueName: embeddedVenue.name }],
        partialFailure: false
      };
    }

    const placesClient = getGooglePlacesClient();
    
    const searchPromises = venues.map(async (venueSpec) => {
      // Normalize to VenueSearchSpec
      const spec: VenueSearchSpec = typeof venueSpec === 'string' 
        ? { name: venueSpec, searchStrategy: 'near_user' }
        : venueSpec;
      
      console.log(`\n🔍 Searching for "${spec.name}"`);
      console.log(`   Strategy: ${spec.searchStrategy}`);
      if (spec.referencePlace) {
        console.log(`   Reference place: ${spec.referencePlace}`);
      }

      try {
        let results;
        
        switch (spec.searchStrategy) {
          case 'near_place': {
            // LLM told us to search near a specific place
            if (!spec.referencePlace) {
              throw new Error('near_place strategy requires referencePlace');
            }
            
            // Step 1: Find the reference place
            console.log(`➡️ Step 1: Finding reference place "${spec.referencePlace}"`);
            let refResults;
            
            if (userLocation) {
              console.log(`   Searching near user location first`);
              refResults = await placesClient.nearbySearch(
                userLocation.lat,
                userLocation.lng,
                { query: spec.referencePlace, radius: 8000, maxResults: 1 }
              );
            } else {
              const city = this.extractCityFromItinerary(itinerary, userLocation);
              console.log(`   Searching in ${city}`);
              refResults = await placesClient.textSearch({ 
                query: `${spec.referencePlace} ${city}`, 
                maxResults: 1 
              });
            }
            
            if (refResults.length === 0) {
              throw new Error(`Could not find reference place: ${spec.referencePlace}`);
            }
            
            const refLocation = refResults[0].location;
            console.log(`✅ Found "${spec.referencePlace}" at ${refLocation.lat}, ${refLocation.lng}`);
            
            // Step 2: Search for venue near that place
            console.log(`➡️ Step 2: Searching for "${spec.name}" near reference place`);
            results = await placesClient.nearbySearch(
              refLocation.lat,
              refLocation.lng,
              { query: spec.name, radius: 1609, maxResults: 3 }
            );
            console.log(`⬅️ Found ${results.length} results`);
            break;
          }
          
          case 'near_user': {
            // LLM told us to search near user's location
            if (!userLocation) {
              console.log(`⚠️ No user location available, falling back to city search`);
              const city = this.extractCityFromItinerary(itinerary, userLocation);
              console.log(`➡️ Searching in ${city}`);
              results = await placesClient.textSearch({ 
                query: spec.name, 
                location: city, 
                maxResults: 3 
              });
            } else {
              console.log(`➡️ Searching near user location: ${userLocation.lat}, ${userLocation.lng}`);
              results = await placesClient.nearbySearch(
                userLocation.lat,
                userLocation.lng,
                { query: spec.name, radius: 1609, maxResults: 3 }
              );
            }
            console.log(`⬅️ Found ${results.length} results`);
            break;
          }
          
          case 'in_city': {
            // LLM told us to search anywhere in the city
            const city = this.extractCityFromItinerary(itinerary, userLocation);
            console.log(`➡️ Searching in city: ${city}`);
            results = await placesClient.textSearch({ 
              query: spec.name, 
              location: city, 
              maxResults: 3 
            });
            console.log(`⬅️ Found ${results.length} results`);
            break;
          }
          
          default:
            throw new Error(`Unknown search strategy: ${(spec as any).searchStrategy}`);
        }
        
        return results.length > 0 
          ? { success: true, venue: this.formatVenue(results[0]), venueName: results[0].name }
          : { success: false, venue: spec.name, error: 'Not found' };
          
      } catch (err) {
        console.error(`❌ Search error for "${spec.name}":`, err);
        return { success: false, venue: spec.name, error: err instanceof Error ? err.message : 'Search failed' };
      }
    });

    const results = await Promise.all(searchPromises);
    const found = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (found.length === 0) {
      return { 
        success: false, 
        updatedVenues: itinerary.venues, 
        message: 'No venues found', 
        error: 'Not found' 
      };
    }

    // Insert venues
    const updated = [...itinerary.venues];
    found.forEach(r => updated.push(r.venue));

    let msg = `✅ Added ${found.length} venue${found.length > 1 ? 's' : ''}:\n\n`;
    found.forEach((r, i) => {
      msg += `${i + 1}. 📍 ${r.venueName}\n`;
    });
    if (failed.length > 0) {
      msg += `\n⚠️ Could not find: ${failed.map(r => r.venue).join(', ')}`;
    }

    return { 
      success: true, 
      updatedVenues: updated, 
      message: msg, 
      subResults: results, 
      partialFailure: failed.length > 0 
    };
  }

  private async executeRemove(op: ModificationOperation, itinerary: CurrentItinerary): Promise<ModificationResult> {
    const targets = op.targetVenues || [];
    const positions = op.positions || [];
    
    console.log(`\n➖ REMOVE: ${targets.length || positions.length} venues`);
    console.log(`   Target venues:`, targets);
    console.log(`   Positions:`, positions);

    const indices: number[] = [];
    const names: string[] = [];

    targets.forEach((target, i) => {
      const idx = this.resolvePosition({ targetVenue: target, position: positions[i] }, itinerary);
      console.log(`   Resolving target "${target}" with position "${positions[i]}" → index ${idx}`);
      if (idx !== -1) {
        indices.push(idx);
        names.push(itinerary.venues[idx].name);
      }
    });

    if (indices.length === 0) {
      return { success: false, updatedVenues: itinerary.venues, message: 'No venues found to remove', error: 'Not found' };
    }

    const sorted = [...indices].sort((a, b) => b - a);
    const updated = [...itinerary.venues];
    sorted.forEach(idx => updated.splice(idx, 1));

    return { success: true, updatedVenues: updated, message: `Removed ${names.length} venue${names.length > 1 ? 's' : ''}: ${names.join(', ')}` };
  }

  private async executeReplace(
    op: ModificationOperation, 
    itinerary: CurrentItinerary, 
    userLocation?: any,
    embeddedVenue?: any
  ): Promise<ModificationResult> {
    const targets = op.targetVenues || [];
    const replacements = op.replaceWith || [];
    
    console.log(`\n🔄 REPLACE: ${targets.length} venues`);
    console.log(`   Target venues:`, targets);
    console.log(`   Positions:`, op.positions);

    if (targets.length !== replacements.length) {
      return { success: false, updatedVenues: itinerary.venues, message: 'Targets and replacements must match', error: 'Mismatch' };
    }

    const ops = targets.map((target, i) => {
      const idx = this.resolvePosition({ targetVenue: target, position: op.positions?.[i] }, itinerary);
      console.log(`   Resolving target "${target}" with position "${op.positions?.[i]}" → index ${idx}`);
      return { target, replacement: replacements[i], index: idx, oldVenue: idx !== -1 ? itinerary.venues[idx] : undefined };
    }).filter(o => o.index !== -1);

    console.log(`   Found ${ops.length} valid venues to replace`);

    if (ops.length === 0) {
      return { success: false, updatedVenues: itinerary.venues, message: 'No venues found to replace', error: 'Not found' };
    }

    const placesClient = getGooglePlacesClient();
    const searches = ops.map(async (o) => {
      // Use embedded venue if available
      if (embeddedVenue && ops.length === 1) {
        console.log(`⚡ Using embedded venue for replacement - SKIPPING API call`);
        return { 
          success: true, 
          index: o.index, 
          oldName: o.oldVenue?.name, 
          newVenue: embeddedVenue, 
          newName: embeddedVenue.name 
        };
      }
      
      // Normalize to VenueSearchSpec
      const spec: VenueSearchSpec = typeof o.replacement === 'string'
        ? { name: o.replacement, searchStrategy: 'near_existing' }
        : o.replacement;
      
      console.log(`\n🔍 Replacing "${o.oldVenue?.name}" with "${spec.name}"`);
      console.log(`   Strategy: ${spec.searchStrategy}`);
      
      try {
        let results;
        let attemptedStrategy = spec.searchStrategy;
        
        switch (spec.searchStrategy) {
          case 'near_existing': {
            // Default: search near the venue being replaced
            console.log(`➡️ Searching near existing venue location`);
            results = await placesClient.nearbySearch(
              o.oldVenue!.location.lat, 
              o.oldVenue!.location.lng, 
              { query: spec.name, radius: 1609, maxResults: 3 }
            );
            
            // 🆕 FALLBACK: If no results found nearby, try city-wide search
            if (results.length === 0) {
              console.log(`⚠️ No results found nearby, retrying with city-wide search...`);
              const city = this.extractCityFromItinerary(itinerary, userLocation);
              results = await placesClient.textSearch({ 
                query: spec.name, 
                location: city, 
                maxResults: 3 
              });
              // Fix lint error: only assign valid type value to attemptedStrategy
              attemptedStrategy = 'in_city';
            }
            break;
          }
          case 'near_place': {
            if (!spec.referencePlace) {
              throw new Error('near_place strategy requires referencePlace');
            }
            
            // Find reference place first
            console.log(`➡️ Finding reference place "${spec.referencePlace}"`);
            let refResults;
            
            if (userLocation) {
              refResults = await placesClient.nearbySearch(
                userLocation.lat,
                userLocation.lng,
                { query: spec.referencePlace, radius: 8000, maxResults: 1 }
              );
            } else {
              const city = this.extractCityFromItinerary(itinerary, userLocation);
              refResults = await placesClient.textSearch({ 
                query: `${spec.referencePlace} ${city}`, 
                maxResults: 1 
              });
            }
            
            if (refResults.length === 0) {
              throw new Error(`Could not find reference place: ${spec.referencePlace}`);
            }
            
            console.log(`✅ Found reference, searching for replacement`);
            results = await placesClient.nearbySearch(
              refResults[0].location.lat,
              refResults[0].location.lng,
              { query: spec.name, radius: 1609, maxResults: 3 }
            );
            break;
          }
          
          case 'near_user': {
            if (!userLocation) {
              console.log(`⚠️ No user location, falling back to near existing venue`);
              results = await placesClient.nearbySearch(
                o.oldVenue!.location.lat, 
                o.oldVenue!.location.lng, 
                { query: spec.name, radius: 1609, maxResults: 3 }
              );
            } else {
              console.log(`➡️ Searching near user location`);
              results = await placesClient.nearbySearch(
                userLocation.lat,
                userLocation.lng,
                { query: spec.name, radius: 1609, maxResults: 3 }
              );
            }
            break;
          }
          
          case 'in_city': {
            const city = this.extractCityFromItinerary(itinerary, userLocation);
            console.log(`➡️ Searching in city: ${city}`);
            results = await placesClient.textSearch({ 
              query: spec.name, 
              location: city, 
              maxResults: 3 
            });
            break;
          }
          
          default:
            // Fallback to near existing
            results = await placesClient.nearbySearch(
              o.oldVenue!.location.lat, 
              o.oldVenue!.location.lng, 
              { query: spec.name, radius: 1609, maxResults: 3 }
            );
        }
        
        console.log(`⬅️ Found ${results.length} results using strategy: ${attemptedStrategy}`);
        
        return results.length > 0 
          ? { success: true, index: o.index, oldName: o.oldVenue?.name, newVenue: this.formatVenue(results[0]), newName: results[0].name }
          : { success: false, index: o.index, oldName: o.oldVenue?.name, error: 'Not found' };
          
      } catch (err) {
        console.error(`❌ Replacement search error:`, err);
        return { success: false, index: o.index, oldName: o.oldVenue?.name, error: err instanceof Error ? err.message : 'Search failed' };
      }
    });

    const results = await Promise.all(searches);
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      return { success: false, updatedVenues: itinerary.venues, message: 'No replacement venues found', error: 'Not found' };
    }

    const updated = [...itinerary.venues];
    successful.forEach(r => { updated[r.index!] = r.newVenue; });

    const pairs = successful.map(r => `${r.oldName} → ${r.newName}`).join(', ');
    let msg = `Replaced ${successful.length} venue${successful.length > 1 ? 's' : ''}: ${pairs}`;
    
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      msg += `. Could not find replacements for: ${failed.map(r => r.oldName).join(', ')}`;
    }

    return { 
      success: true, 
      updatedVenues: updated, 
      message: msg, 
      partialFailure: failed.length > 0 
    };
  }

  private resolvePosition(op: { targetVenue?: string; position?: string }, itinerary: CurrentItinerary): number {
    const venues = itinerary.venues;

    // Handle pure numbers like "8"
    if (op.position && /^\d+$/.test(op.position)) {
      const idx = parseInt(op.position) - 1;
      return idx >= 0 && idx < venues.length ? idx : -1;
    }

    // Handle "stop 8", "stop number 8", "8th stop", etc.
    if (op.position) {
      const stopMatch = op.position.match(/(?:stop\s*(?:number\s*)?|#)?(\d+)(?:th|st|nd|rd)?\s*(?:stop)?/i);
      if (stopMatch) {
        const idx = parseInt(stopMatch[1]) - 1;
        console.log(`📍 Resolved "${op.position}" to index ${idx}`);
        return idx >= 0 && idx < venues.length ? idx : -1;
      }
    }

    // Handle targetVenue with "stop 8" pattern
    if (op.targetVenue) {
      const stopMatch = op.targetVenue.match(/(?:stop\s*(?:number\s*)?|#)?(\d+)(?:th|st|nd|rd)?\s*(?:stop)?/i);
      if (stopMatch) {
        const idx = parseInt(stopMatch[1]) - 1;
        console.log(`📍 Resolved "${op.targetVenue}" to index ${idx}`);
        return idx >= 0 && idx < venues.length ? idx : -1;
      }
    }

    if (op.position === 'first') return 0;
    if (op.position === 'last') return venues.length - 1;
    if (op.position === 'second') return 1;
    if (op.position === 'third') return 2;

    if (op.targetVenue) {
      const target = op.targetVenue.toLowerCase();
      
      let idx = venues.findIndex(v => v.name.toLowerCase() === target);
      if (idx !== -1) return idx;
      
      idx = venues.findIndex(v => v.name.toLowerCase().includes(target));
      if (idx !== -1) return idx;
      
      idx = venues.findIndex(v => target.includes(v.name.toLowerCase()));
      if (idx !== -1) return idx;
      
      const firstWord = target.split(/[\s-]/)[0];
      if (firstWord.length > 3) {
        idx = venues.findIndex(v => v.name.toLowerCase().split(/[\s-]/)[0] === firstWord);
        if (idx !== -1) return idx;
      }
    }

    if (op.position) {
      const afterMatch = op.position.match(/after\s+(.+)/i);
      const beforeMatch = op.position.match(/before\s+(.+)/i);

      if (afterMatch) {
        const ref = afterMatch[1].trim();
        const idx = venues.findIndex(v => v.name.toLowerCase().includes(ref.toLowerCase()));
        return idx !== -1 ? idx + 1 : -1;
      }

      if (beforeMatch) {
        const ref = beforeMatch[1].trim();
        const idx = venues.findIndex(v => v.name.toLowerCase().includes(ref.toLowerCase()));
        return idx !== -1 ? idx : -1;
      }
    }

    return -1;
  }

  private formatVenue(place: any): any {
    return {
      name: place.name,
      address: place.address,
      location: { lat: place.location.lat, lng: place.location.lng, coordinates: `${place.location.lat},${place.location.lng}` },
      rating: place.rating,
      priceLevel: place.priceLevel ? '$'.repeat(place.priceLevel) : 'N/A',
      placeId: place.placeId,
      types: place.types,
      photoUrl: place.photoUrl,
      description: place.description,
      photos: place.photos
    };
  }

  /**
   * 🆕 IMPROVED: Extract city from itinerary with smart fallback
   */
  private extractCityFromItinerary(
    itinerary: CurrentItinerary,
    userLocation?: { lat: number; lng: number; name: string }
  ): string {
    // Priority 1: Extract from user location if available
    if (userLocation) {
      const extractedCity = this.extractCityFromUserLocation(userLocation);
      if (extractedCity) {
        console.log(`   Using city from user location: ${extractedCity}`);
        return extractedCity;
      }
    }

    // Priority 2: Try to extract from first venue address
    if (itinerary.venues.length > 0) {
      const address = itinerary.venues[0].address;
      console.log(`   Trying to extract city from venue address: ${address}`);
      
      // Handle different address formats:
      // "Retiro, 28014 Madrid, Spain" → "Madrid"
      // "123 Main St, Boston, MA 02101" → "Boston, MA"
      // "Pasadizo de San Ginés, 5, Centro, 28013 Madrid, Spain" → "Madrid"
      
      const parts = address.split(',').map((p: string) => p.trim());
      
      if (parts.length >= 2) {
        // Try to find city part (usually before postal code or country)
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          
          // Skip country names (common ones)
          if (['Spain', 'United States', 'USA', 'France', 'Italy', 'UK', 'Germany'].includes(part)) {
            continue;
          }
          
          // Skip parts with postal codes
          if (/\d{5}/.test(part)) {
            // Check if city name is in this part before postal code
            const cityMatch = part.match(/^([A-Za-z\s]+)\s+\d{5}/);
            if (cityMatch) {
              console.log(`   Extracted city: ${cityMatch[1]}`);
              return cityMatch[1];
            }
            continue;
          }
          
          // If we find a part that looks like a city (starts with capital letter, no numbers)
          if (/^[A-Z][a-z]+/.test(part) && !/\d/.test(part)) {
            console.log(`   Extracted city: ${part}`);
            return part;
          }
        }
      }
    }

    // Priority 3: Default to a reasonable fallback
    console.log(`   ⚠️ Could not extract city, using default: New York`);
    return 'New York';  // Better default than "Boston"
  }
}

export const modificationAgent = new ModificationAgent();