// backend/services/modification-agent.ts - PHASE 3

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { getGooglePlacesClient } from './api-clients/google-places.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ModificationOperation {
  type: 'ADD' | 'REMOVE' | 'REPLACE';
  venues?: string[];
  positions?: string[];
  targetVenues?: string[];
  replaceWith?: string[];
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
  
  async executeModification(
    userPrompt: string,
    currentItinerary: CurrentItinerary,
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<ModificationResult> {
    console.log('\n🔧 Agent 4: Modification Agent (Phase 3) starting...');
    console.log(`📝 User request: "${userPrompt}"`);

    // 🆕 Extract embedded venue data if present
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
- Numbers: "1", "2", "3"
- Keywords: "first", "second", "third", "last"
- Relative: "after [venue name]", "before [venue name]", "near [venue name]"
- Multiple: "first and third", "second and last"
- Default: "at the end" (for ADD)

⚠️ CRITICAL FOR POSITION REFERENCES:
When user says "near X", "after Y", "before Z":
- Extract the EXACT reference venue name from their prompt
- Include it in the position field
- Examples:
  * "add coffee near northeastern" → position: "near northeastern"
  * "add cafe after museum" → position: "after museum"
  * "add bar before first stop" → position: "before first stop"

=== EXAMPLES ===

User: "add coffee shop near northeastern"
Output: {
  "type": "ADD",
  "venues": ["coffee shop"],
  "positions": ["near northeastern"]
}

User: "add museum and park after the bar"
Output: {
  "type": "ADD",
  "venues": ["museum", "park"],
  "positions": ["after the bar", "after the bar"]
}

User: "add cafe"
Output: {
  "type": "ADD",
  "venues": ["cafe"],
  "positions": ["at the end"]
}

User: "remove bar and add cafe near museum"
Output: {
  "operations": [
    {
      "type": "REMOVE",
      "targetVenues": ["bar"],
      "positions": ["bar"]
    },
    {
      "type": "ADD",
      "venues": ["cafe"],
      "positions": ["near museum"]
    }
  ]
}

User: "add museum and park"
Output: {
  "type": "ADD",
  "venues": ["museum", "park"],
  "positions": ["at the end", "at the end"]
}

User: "remove first and third stops"
Output: {
  "type": "REMOVE",
  "targetVenues": ["first stop", "third stop"],
  "positions": ["first", "third"]
}

User: "replace second with cafe"
Output: {
  "type": "REPLACE",
  "targetVenues": ["second stop"],
  "replaceWith": ["cafe"],
  "positions": ["second"]
}

=== OUTPUT JSON FORMAT ===

Single operation JSON:
{
  "type": "ADD" | "REMOVE" | "REPLACE",
  "venues": ["venue1", "venue2"],
  "positions": ["position1", "position2"]
}

Multiple operations JSON (return ARRAY):
{
  "operations": [
    {
      "type": "REMOVE",
      "targetVenues": ["bar"],
      "positions": ["first"]
    },
    {
      "type": "ADD",
      "venues": ["cafe"],
      "positions": ["near museum"]
    }
  ]
}

Execution order: REMOVE → REPLACE → ADD (you don't need to sort, I'll handle it)

Parse carefully and extract all operations. Always return valid JSON.`
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
    console.log(`   User location in itinerary: ${itinerary.hasUserLocation ? `Yes (index ${itinerary.userLocationIndex})` : 'No'}`);
    
    // 🆕 NEW: If we have embedded venue data, use it directly!
    if (embeddedVenue && venues.length === 1) {
      console.log(`⚡ Using embedded venue data - SKIPPING Google Places API call`);
      console.log(`   Venue: ${embeddedVenue.name}`);
      console.log(`   PlaceId: ${embeddedVenue.placeId}`);
      
      const updated = [...itinerary.venues];
      let insertIdx = itinerary.venues.length;
      
      const hasExplicitPositions = op.positions?.some(p => p && (p.includes('after') || p.includes('before')));
      if (hasExplicitPositions && op.positions?.[0]) {
        const refIndex = this.resolvePosition({ position: op.positions[0] }, itinerary);
        if (refIndex !== -1) {
          insertIdx = refIndex + 1;
        }
      }
      
      updated.splice(insertIdx, 0, embeddedVenue);
      
      const msg = `✅ Added venue:\n\n1. 📍 ${embeddedVenue.name}\n   (using cached data - no API call needed)`;
      
      return { 
        success: true, 
        updatedVenues: updated, 
        message: msg,
        subResults: [{ success: true, venue: embeddedVenue.name, position: insertIdx, venueName: embeddedVenue.name }],
        partialFailure: false
      };
    }

    let baseInsertIndex = itinerary.venues.length;
    const hasExplicitPositions = op.positions?.some(p => p && (p.includes('after') || p.includes('before')));

    let searchLocation: any;
    if (hasExplicitPositions && op.positions?.[0]) {
      const refIndex = this.resolvePosition({ position: op.positions[0] }, itinerary);
      if (refIndex > 0) {
        searchLocation = itinerary.venues[refIndex - 1].location;
      }
    }

    const placesClient = getGooglePlacesClient();
    
    const searchPromises = venues.map(async (venue) => {
      try {
        let results;
        
        // 🆕 PRIORITY 1: Use explicit position's location
        if (searchLocation) {
          console.log(`➡️ Google Places nearbySearch request for query="${venue}" at lat=${searchLocation.lat}, lng=${searchLocation.lng}, radius=1609, maxResults=3`);
          results = await placesClient.nearbySearch(searchLocation.lat, searchLocation.lng, { query: venue, radius: 1609, maxResults: 3 });
          console.log(`⬅️ Google Places nearbySearch response for query="${venue}": ${JSON.stringify(results?.slice(0,3) || results)}`);
        } 
        // 🆕 PRIORITY 2: Use user location if available
        else if (userLocation) {
          console.log(`➡️ Google Places nearbySearch request for query="${venue}" at USER LOCATION lat=${userLocation.lat}, lng=${userLocation.lng}, radius=1609, maxResults=3`);
          results = await placesClient.nearbySearch(userLocation.lat, userLocation.lng, { query: venue, radius: 1609, maxResults: 3 });
          console.log(`⬅️ Google Places nearbySearch response for query="${venue}": ${JSON.stringify(results?.slice(0,3) || results)}`);
        }
        // FALLBACK: Extract city from itinerary (least preferred)
        else {
          const city = this.extractCityFromItinerary(itinerary);
          console.log(`➡️ Google Places textSearch request for query="${venue}", location="${city}", maxResults=3`);
          results = await placesClient.textSearch({ query: venue, location: city, maxResults: 3 });
          console.log(`⬅️ Google Places textSearch response for query="${venue}": ${JSON.stringify(results?.slice(0,3) || results)}`);
        }
        
        return results.length > 0 ? { success: true, venue: this.formatVenue(results[0]), venueName: results[0].name } : { success: false, venue, error: 'Not found' };
      } catch (err) {
        console.error(`❌ Google Places search error for query="${venue}":`, err);
        return { success: false, venue, error: 'Search failed' };
      }
    });

    const results = await Promise.all(searchPromises);
    const found = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (found.length === 0) {
      return { success: false, updatedVenues: itinerary.venues, message: 'No venues found', error: 'Not found' };
    }

    const updated = [...itinerary.venues];
    let insertIdx = baseInsertIndex;
    
    found.forEach(r => {
      updated.splice(insertIdx++, 0, r.venue);
    });

    let msg = `✅ Added ${found.length} venue${found.length > 1 ? 's' : ''}:\n\n`;
    found.forEach((r, i) => {
      msg += `${i + 1}. 📍 ${r.venueName}\n`;
    });
    if (failed.length > 0) {
      msg += `\n⚠️ Could not find: ${failed.map(r => r.venue).join(', ')}`;
    }

    return { success: true, updatedVenues: updated, message: msg, subResults: results, partialFailure: failed.length > 0 };
  }

  private async executeRemove(op: ModificationOperation, itinerary: CurrentItinerary): Promise<ModificationResult> {
    const targets = op.targetVenues || [];
    const positions = op.positions || [];
    
    console.log(`\n➖ REMOVE: ${targets.length || positions.length} venues`);

    const indices: number[] = [];
    const names: string[] = [];

    targets.forEach((target, i) => {
      const idx = this.resolvePosition({ targetVenue: target, position: positions[i] }, itinerary);
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

    if (targets.length !== replacements.length) {
      return { success: false, updatedVenues: itinerary.venues, message: 'Targets and replacements must match', error: 'Mismatch' };
    }

    const ops = targets.map((target, i) => {
      const idx = this.resolvePosition({ targetVenue: target, position: op.positions?.[i] }, itinerary);
      return { target, replacement: replacements[i], index: idx, oldVenue: idx !== -1 ? itinerary.venues[idx] : undefined };
    }).filter(o => o.index !== -1);

    if (ops.length === 0) {
      return { success: false, updatedVenues: itinerary.venues, message: 'No venues found to replace', error: 'Not found' };
    }

    const placesClient = getGooglePlacesClient();
    const searches = ops.map(async (o) => {
      try {
        let results;
        
        // 🆕 Use embedded venue if available
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
        
        results = await placesClient.nearbySearch(o.oldVenue!.location.lat, o.oldVenue!.location.lng, { query: o.replacement, radius: 1609, maxResults: 3 });
        
        return results.length > 0 ? { success: true, index: o.index, oldName: o.oldVenue?.name, newVenue: this.formatVenue(results[0]), newName: results[0].name } : { success: false, index: o.index, oldName: o.oldVenue?.name, error: 'Not found' };
      } catch {
        return { success: false, index: o.index, oldName: o.oldVenue?.name, error: 'Search failed' };
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
    if (failed.length > 0) msg += `. Could not find replacements for: ${failed.map(r => r.oldName).join(', ')}`;

    return { success: true, updatedVenues: updated, message: msg, partialFailure: failed.length > 0 };
  }

  private resolvePosition(op: { targetVenue?: string; position?: string }, itinerary: CurrentItinerary): number {
    const venues = itinerary.venues;

    if (op.position && /^\d+$/.test(op.position)) {
      const idx = parseInt(op.position) - 1;
      return idx >= 0 && idx < venues.length ? idx : -1;
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

  private extractCityFromItinerary(itinerary: CurrentItinerary): string {
    if (itinerary.venues.length > 0) {
      const parts = itinerary.venues[0].address.split(',').map((p: string) => p.trim());
      if (parts.length >= 2) {
        const city = parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
        return city.replace(/\s+[A-Z]{2}\s+\d{5}.*/, '').trim();
      }
    }
    return 'Boston';
  }
}

export const modificationAgent = new ModificationAgent();