# PRD: Update Classified Part Lookup to v4 Catalog

## 1. Introduction/Overview

This document outlines the requirements for updating the system to use the `catalogData_v4.json.gz` (v4 catalog) instead of the `catalogData_v3.json.gz` (v3 catalog) for looking up the grid and bin location of a classified part ID. This change is necessary because the v4 catalog contains additional parts, including newly added printed parts, which are not present in the v3 catalog.

The primary goal is to ensure more parts are correctly identified and sorted by the system, reducing the number of parts that are skipped due to missing catalog information.

## 2. Goals

- Replace the usage of `catalogData_v3.json.gz` with `catalogData_v4.json.gz` for grid/bin lookups.
- Ensure the system exclusively downloads and utilizes the v4 catalog for these lookups.
- Improve the part sorting accuracy by including a more comprehensive set of parts from the v4 catalog.
- Minimize disruption to other system functionalities.

## 3. User Stories

- As a system administrator/user, I want the Rebrick Sorter to use the latest v4 parts catalog for determining a part's grid and bin location, so that more parts (especially new and printed ones) are correctly sorted and fewer parts are skipped.

## 4. Functional Requirements

1.  The system **must** fetch and use `catalogData_v4.json.gz` for all lookups of grid and bin locations based on a classified part ID.
2.  The system **must** cease downloading and using `catalogData_v3.json.gz` for this purpose.
3.  The mechanism for accessing and parsing the catalog data (e.g., URL structure, file format, data structure for lookup) is expected to remain the same, with only the filename changing from `_v3` to `_v4`.
4.  The system should handle cases where a part ID might exist in the old v3 data but not in v4 (though the primary expectation is v4 is a superset for relevant parts). Given the instruction that "Once the code is updated it should only be downloading and use the v4 catalog," the system should rely solely on v4 data. If a part ID isn't found in v4, it implies it's not sortable with the current catalog.

## 5. Non-Goals (Out of Scope)

- This change does not include updating other parts of the system that might use the v3 catalog for different purposes (unless identified during implementation as directly dependent and trivial to change). The initial assessment is that this is the primary/only use for classified part lookups.
- Re-validating the correctness of grid/bin assignments within the v4 catalog itself (this is assumed to be correct).
- Changes to the UI for managing catalog versions (unless strictly necessary for the switch).

## 6. Design Considerations (Optional)

- N/A - The change is primarily backend and data source related.

## 7. Technical Considerations

- The primary change will be in `lib/services/ClassifierService.ts`, specifically updating the filename from `catalogData_v3.json.gz` to `catalogData_v4.json.gz`.
- Ensure any caching mechanisms related to catalog data are properly invalidated or updated.
- Confirm that the deployment process correctly provisions the v4 catalog file if it's a new addition to the expected deployment artifacts.

## 8. Success Metrics

- Reduction in the number of parts skipped due to "part ID not found in catalog" errors or similar issues.
- Successful lookup and sorting of newly added parts (e.g., printed parts) that are present in v4 but were missing in v3.
- The system logs or internal metrics show that `catalogData_v4.json.gz` is being accessed for lookups.

## 9. Open Questions

- Are there any automated tests that specifically validate the part lookup against the catalog? If so, these may need updating to reflect the v4 data or new test cases for v4-specific parts. (User indicated prior checking, but good to keep in mind).
