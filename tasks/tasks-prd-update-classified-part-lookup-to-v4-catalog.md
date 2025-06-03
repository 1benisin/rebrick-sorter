## Relevant Files

- `lib/services/ClassifierService.ts` - Contains the logic for loading and using the catalog data for part classification.
- `lib/services/ClassifierService.test.ts` - Unit tests for `ClassifierService.ts` (should be updated or created to reflect catalog changes).

### Notes

- Unit tests should typically be placed alongside the code files they are testing.
- Use `npx jest lib/services/ClassifierService.test.ts` to run specific tests, or `npx jest` for all tests.

## Tasks

- [x] 1.0 Update `ClassifierService` to Reference v4 Catalog
  - [x] 1.1 Modify `ClassifierService.ts` to change the catalog filename from `catalogData_v3.json.gz` to `catalogData_v4.json.gz` in the download URL/path.
- [x] 2.0 Ensure Correct Loading and Parsing of `catalogData_v4.json.gz`
  - [x] 2.1 Manually verify (or add a debug log) that the `catalogData_v4.json.gz` is fetched and parsed without errors during initialization of `ClassifierService`.
  - [x] 2.2 Confirm the data structure loaded from v4 is compatible with the existing parsing logic (as indicated in PRD).
- [x] 3.0 Address Catalog Data Caching
  - [x] 3.1 Review `ClassifierService.ts` and related services for any explicit caching mechanisms for the catalog data.
  - [x] 3.2 If file-based or URL-based caching is found, ensure the change in filename to `_v4` naturally handles cache invalidation. If other forms of caching are present, implement necessary invalidation logic.
