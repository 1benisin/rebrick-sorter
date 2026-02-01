Review the implementation of the specified phase against the referenced plan document.

After this command, provide:
1. The phase number (e.g., "Phase 2" or just "2")
2. A reference to the implementation plan file for this phaseusing @file syntax (e.g., @_plans/MY_PLAN.md)
3. Optional: a reference to the entire refactor plan containing this phase using @file syntax (e.g., @_plans/CONSTANT_SPEED_SIMPLIFICATION_PLAN.md)

Example usage: `/review-phase Phase 2 @_plans/CONSTANT_SPEED_SIMPLIFICATION_PLAN.md @_plans/CONSTANT_SPEED_SIMPLIFICATION_PLAN.md`

## 2. Issues Found
List any bugs, edge cases, or potential problems found in either the implementation or the plan itself. For each issue include:
- **Location**: file and line number (or "Plan" if it's a plan issue)
- **Severity**: Critical / High / Medium / Low
- **Description**: What the issue is
- **Recommendation**: Suggested fix or mitigation

When reviewing, also examine related code that interacts with the refactored components but wasn't directly modified—these integration points are common sources of bugs.

Focus on:
- Correctness: Does the code do what the plan specifies?
- Edge cases: Are there unhandled scenarios?
- Integration: Do the changes work correctly with existing code?
- Consistency: Are naming conventions, patterns, and data flows consistent?

## 3. Clarifying Questions (if needed)
List ambiguities as specific yes/no or multiple-choice questions.

Call out any bugs, edge cases, or potential problems found in either the implementation, the plan itself, or in enterfacing with the codebase that wasn't changed in this phase.
The goal is to keep the code both simple and correct. And keeping the entropy of the codebase low.