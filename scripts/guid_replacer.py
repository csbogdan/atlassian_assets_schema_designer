#!/usr/bin/env python3
"""
Smart GUID Replacer for Schema Files
Automatically replaces all cmdb::externalId/GUID references with human-readable names

Naming Convention:
- Object Types: cmdb-{object_name} (e.g., cmdb-users, cmdb-groups)
- Attributes: {object_name}-{attribute_name} (e.g., users-name, groups-description)
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

def clean_name_for_id(name):
    """Convert a human-readable name to a clean identifier"""
    # Remove special characters and convert to lowercase
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', name)
    # Replace spaces with hyphens and convert to lowercase
    clean = re.sub(r'\s+', '-', clean.strip()).lower()
    # Remove duplicate hyphens
    clean = re.sub(r'-+', '-', clean)
    # Remove leading/trailing hyphens
    clean = clean.strip('-')
    return clean

def generate_unique_name(base_name, used_names, counter_dict):
    """Generate a unique name, adding numbers if needed"""
    if base_name not in used_names:
        used_names.add(base_name)
        return base_name
    
    # If name already exists, add counter
    counter = counter_dict[base_name] + 1
    counter_dict[base_name] = counter
    
    while f"{base_name}-{counter}" in used_names:
        counter += 1
        counter_dict[base_name] = counter
    
    unique_name = f"{base_name}-{counter}"
    used_names.add(unique_name)
    return unique_name

def extract_guid_mappings(data):
    """Extract all GUID mappings from the JSON data"""
    guid_pattern = r'cmdb::externalId/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
    mappings = {}
    used_names = set()
    counter_dict = defaultdict(int)
    
    def process_object(obj, object_type_name="", path=""):
        if isinstance(obj, dict):
            # Check if this is an object type (has externalId and name, may or may not have attributes)
            if "externalId" in obj and "name" in obj:
                obj_name = clean_name_for_id(obj["name"])
                object_type_name = f"cmdb-{obj_name}"  # More generic prefix
                
                # Handle object type externalId
                if obj["externalId"].startswith("cmdb::externalId/"):
                    guid_match = re.search(guid_pattern, obj["externalId"])
                    if guid_match:
                        guid = guid_match.group(1)
                        unique_name = generate_unique_name(object_type_name, used_names, counter_dict)
                        mappings[guid] = unique_name
                        print(f"Object Type: {obj['name']} -> {unique_name}")
                
                # If this object type has attributes, process them
                if "attributes" in obj:
                    for attr in obj["attributes"]:
                        process_attribute(attr, object_type_name)
                
                # If this object type has children, process them
                if "children" in obj:
                    for child in obj["children"]:
                        process_object(child, "", f"{path}.children")
            
            # Process any other nested structures
            for key, value in obj.items():
                if key not in ["attributes", "children"]:  # Already processed above
                    if isinstance(value, (dict, list)):
                        process_object(value, object_type_name, f"{path}.{key}")
        
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                process_object(item, object_type_name, f"{path}[{i}]")
    
    def process_attribute(attr, object_type_name):
        """Process an individual attribute"""
        if not isinstance(attr, dict) or "name" not in attr:
            return
            
        attr_name = clean_name_for_id(attr["name"])
        
        # Determine context for attribute naming
        if object_type_name:
            # Use the object type name directly (e.g., users, groups, licenses)
            obj_type_short = object_type_name.replace("cmdb-", "")
            base_attr_name = f"{obj_type_short}-{attr_name}"  # e.g., users-name, groups-description
        else:
            base_attr_name = f"attr-{attr_name}"  # Fallback for orphaned attributes
        
        # Handle attribute externalId
        if "externalId" in attr and attr["externalId"].startswith("cmdb::externalId/"):
            guid_match = re.search(guid_pattern, attr["externalId"])
            if guid_match:
                guid = guid_match.group(1)
                unique_name = generate_unique_name(base_attr_name, used_names, counter_dict)
                mappings[guid] = unique_name
                print(f"  Attribute: {attr['name']} -> {unique_name}")
    
    # First pass: collect all object types and attributes
    process_object(data)
    
    # Second pass: collect any remaining GUIDs (like in referenceObjectTypeExternalId)
    def collect_remaining_guids(obj, path=""):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if isinstance(value, str) and value.startswith("cmdb::externalId/"):
                    guid_match = re.search(guid_pattern, value)
                    if guid_match:
                        guid = guid_match.group(1)
                        if guid not in mappings:
                            # Create a generic name for unmapped GUIDs
                            generic_name = f"cmdb-ref-{guid[:8]}"
                            unique_name = generate_unique_name(generic_name, used_names, counter_dict)
                            mappings[guid] = unique_name
                            print(f"Reference GUID: {guid} -> {unique_name}")
                elif isinstance(value, (dict, list)):
                    collect_remaining_guids(value, f"{path}.{key}")
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                collect_remaining_guids(item, f"{path}[{i}]")
    
    print("\nSecond pass - collecting remaining GUIDs...")
    collect_remaining_guids(data)
    
    return mappings

def replace_guids_in_file(file_path, mappings):
    """Replace all GUIDs in the file with their mapped names and save to a new file"""
    print(f"\nReading file: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Generate output filename
    path_obj = Path(file_path)
    output_path = path_obj.parent / f"{path_obj.stem}_cleaned{path_obj.suffix}"
    
    # Apply replacements
    replacements_made = 0
    for guid, new_name in mappings.items():
        old_pattern = f"cmdb::externalId/{guid}"
        if old_pattern in content:
            content = content.replace(old_pattern, new_name)
            replacements_made += 1
            print(f"Replaced: {old_pattern} -> {new_name}")
    
    # Write the updated content to new file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"\nCompleted! Made {replacements_made} replacements.")
    print(f"Original file preserved: {file_path}")
    print(f"Clean file created: {output_path}")
    return replacements_made, output_path

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 guid_replacer.py <json_file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    if not Path(file_path).exists():
        print(f"Error: File {file_path} not found")
        sys.exit(1)
    
    try:
        # Load and parse JSON
        print(f"Loading JSON file: {file_path}")
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Extract GUID mappings
        print("\nExtracting GUID mappings...")
        mappings = extract_guid_mappings(data)
        
        print(f"\nFound {len(mappings)} GUID mappings to replace")
        
        if not mappings:
            print("No GUIDs found to replace!")
            return
        
        # Show summary
        print(f"\nSummary of mappings:")
        for guid, name in sorted(mappings.items()):
            print(f"  {guid} -> {name}")
        
        # Ask for confirmation
        response = input(f"\nProceed with replacing {len(mappings)} GUIDs? (y/N): ")
        if response.lower() != 'y':
            print("Operation cancelled.")
            return
        
        # Apply replacements
        replacements_made, output_path = replace_guids_in_file(file_path, mappings)
        
        # Verify no GUIDs remain in the output file
        with open(output_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        remaining_guids = re.findall(r'cmdb::externalId/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', content)
        
        if remaining_guids:
            print(f"\nWarning: {len(remaining_guids)} GUIDs still remain in the output file:")
            for guid in remaining_guids[:10]:  # Show first 10
                print(f"  {guid}")
            if len(remaining_guids) > 10:
                print(f"  ... and {len(remaining_guids) - 10} more")
        else:
            print(f"\n✅ Success! All GUIDs have been replaced with human-readable names.")
            print(f"✅ Total replacements made: {replacements_made}")
            print(f"✅ Original file preserved: {file_path}")
            print(f"✅ Clean file created: {output_path}")
    
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON file - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()