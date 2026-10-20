# Army Transport regression-test checklist

This folder is a place to plan and add project-specific tests. No application code is changed by this starter pack.

Before adding tests, inspect the existing framework and scripts in `package.json`. Use the test framework already installed if one exists; do not add a second framework blindly.

## High-value behavior to cover

- A vehicle marked `maintenance` is never offered as available for a new trip.
- Starting a trip changes the vehicle/trip state consistently.
- A vehicle cannot have conflicting active trips.
- A gate scan for an unknown plate does not silently select an unrelated vehicle.
- A failed trip/position write does not leave misleading partial state.
- Force-stop actions enforce the intended role/permission rules.
- Invalid or missing input is rejected with a safe response.

These are test ideas, not claims that the current implementation has these bugs. Confirm the intended product behavior before writing assertions.

## Example test-case format

For each business rule, document:
1. Given: starting database/application state.
2. When: the action being performed.
3. Then: the expected result.
4. Also test: an invalid state or boundary case.

Do not consider a rule verified until an executable automated test asserts the expected behavior.
