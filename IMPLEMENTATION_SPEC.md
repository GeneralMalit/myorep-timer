# Saved Sessions Implementation Spec

## Status
- Owner: Codex planning pass
- Scope: significant feature upgrade
- Target: add programmable `Saved Sessions` without breaking existing `Saved Workouts`

## 1. Goal
Add a new feature called `Saved Sessions` that lets the user program and save a full workout session as an ordered sequence of nodes.

Each session is a linear flow:
- `Start`
- zero or more session nodes
- `End`

Supported node types:
- `Workout Node`
- `Workout Rest Node`

The existing `Saved Workouts` feature must remain usable exactly as it is today:
- users can still load a saved workout directly into the single-workout setup
- users can also use a saved workout as the source for a workout node while building a saved session

This feature is explicitly a new orchestration layer above the current single-workout timer engine. It is not a rewrite of the timer state machine.

## 2. Product Definitions

### 2.1 Workout Node
A workout node represents one individual workout using the existing workout setup fields:
- `sets`
- `reps`
- `seconds`
- `rest`
- `myoReps`
- `myoWorkSecs`

Rules:
- must support `1+` cycles
- uses the same validation rules as the current workout setup
- may be created from:
  - current setup values
  - a saved workout
  - manual editing in the node editor

### 2.2 Workout Rest Node
A workout rest node represents a standalone rest block between workout nodes.

Rules:
- does not contain reps or workout cycles
- only has a `seconds` value
- should run as a pure timed rest block

### 2.3 Saved Session
A saved session is an ordered list of session nodes plus metadata.

Rules:
- linear only in v1
- no branching
- no nested sessions
- no arbitrary graph edges

## 3. Non-Goals for V1
- Freeform graph editor
- Branching logic
- Conditional nodes
- Live bidirectional sync between a session node and its source saved workout
- Session import/export unless there is extra time after core delivery

## 4. Design Constraints
- Do not break the current workout timing model in `src/store/useWorkoutStore.ts`
- Do not push session orchestration logic into `advanceCycle()` beyond what is required for single-workout completion signaling
- Keep `Saved Workouts` intact and backwards-compatible
- Preserve existing persistent storage values for workouts/settings/theme
- Do not persist transient runtime timer state across refresh

## 5. Architecture Decision
Implement `Saved Sessions` as a separate orchestration layer above the existing workout runtime.

This means:
- the current workout engine remains responsible for a single workout node
- a new session runner decides which node is active
- when the active node is a workout node, the runner feeds that node into the existing workout engine
- when the active node is a rest node, the runner uses a dedicated rest-node runtime path

This separation is mandatory. It keeps the current timer FSM stable and makes the feature tractable.

## 6. Data Model

### 6.1 New Types
Create a new file:
- `src/types/savedSessions.ts`

Add the following shapes:

```ts
import type { SavedWorkoutConfig } from '@/types/savedWorkouts';

export type SessionNodeType = 'workout' | 'rest';

export interface SessionNodeBase {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface WorkoutSessionNode extends SessionNodeBase {
    type: 'workout';
    config: SavedWorkoutConfig;
    sourceWorkoutId: string | null;
}

export interface RestSessionNode extends SessionNodeBase {
    type: 'rest';
    seconds: string;
}

export type SessionNode = WorkoutSessionNode | RestSessionNode;

export interface SavedSession {
    id: string;
    name: string;
    nodes: SessionNode[];
    timesUsed: number;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
```

### 6.2 Optional Runtime Types
These can live in the store file if preferred.

```ts
export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished';
```

## 7. Store Changes
Primary file:
- `src/store/useWorkoutStore.ts`

### 7.1 Add Persistent State
Add:
- `savedSessions: SavedSession[]`
- `selectedSavedSessionId: string | null`

### 7.2 Add Session Builder UI State
Add:
- `setupMode: 'workout' | 'session'`
- `editingSessionId: string | null`
- `editingSessionDraft: SavedSession | null`
- `editingSessionNodeId: string | null`

Notes:
- `setupMode` controls whether the setup screen is showing the current single-workout form or the session builder
- `editingSessionDraft` is the working copy for the builder; do not mutate persisted sessions directly during editing

### 7.3 Add Session Runtime State
Add:
- `activeSessionId: string | null`
- `activeSessionNodeIndex: number`
- `sessionStatus: SessionStatus`
- `isRunningSession: boolean`
- `sessionNodeRuntimeType: 'workout' | 'rest' | null`
- `sessionRestTimeLeft: number`
- `sessionLastTickSecond: number`

### 7.4 Add Session CRUD Actions
Add actions:
- `createSession(name: string)`
- `saveSessionDraft(name?: string)`
- `saveSessionDraftAs(name: string)`
- `loadSessionForEditing(id: string)`
- `renameSession(id: string, name: string)`
- `deleteSession(id: string)`
- `duplicateSession(id: string, name: string)`

### 7.5 Add Draft Node Actions
Add actions:
- `addWorkoutNodeFromCurrentSetup()`
- `addWorkoutNodeFromSavedWorkout(workoutId: string)`
- `addRestNode(seconds?: string)`
- `updateWorkoutNode(nodeId: string, config: SavedWorkoutConfig, name?: string)`
- `updateRestNode(nodeId: string, seconds: string, name?: string)`
- `removeSessionNode(nodeId: string)`
- `moveSessionNode(nodeId: string, direction: 'left' | 'right')`
- `insertSessionNodeAfter(afterNodeId: string | null, node: SessionNode)`
- `setEditingSessionNodeId(nodeId: string | null)`

### 7.6 Add Session Runner Actions
Add actions:
- `startSession(id: string)`
- `pauseSession()`
- `resumeSession()`
- `resetSession()`
- `advanceSessionNode()`
- `startSessionNode(index: number)`
- `completeSessionNode()`
- `setSessionRestTimeLeft(time: number)`
- `setSessionLastTickSecond(sec: number)`

## 8. Validation Rules

### 8.1 Workout Node Validation
Reuse existing workout validation:
- same sanitize logic
- same single-set rules
- same multi-set cluster rules

### 8.2 Rest Node Validation
Rules:
- `seconds` must parse to integer `> 0`

### 8.3 Session Validation
A session is valid if:
- `name` is non-empty
- `nodes.length > 0`
- every node is valid

## 9. Utilities
Create a new file:
- `src/utils/savedSessions.ts`

Required helpers:
- `sanitizeRestNodeSeconds`
- `isValidRestNode`
- `createWorkoutSessionNode`
- `createRestSessionNode`
- `createSavedSession`
- `cloneSessionNode`
- `cloneSavedSession`
- `moveNodeInArray`
- `isValidSavedSession`

If import/export is included in v1, also add:
- `buildSavedSessionsExport`
- `mergeSavedSessionsFromImport`

## 10. UI Spec

### 10.1 Sidebar
Primary file:
- `src/components/Sidebar.tsx`

Add a new section for `Saved Sessions`.

Capabilities:
- list sessions
- load session for editing
- rename session
- delete session
- duplicate session
- start session directly if setup mode allows it

Keep `Saved Workouts` untouched except for adding actions that allow using them as sources for workout nodes in the builder.

### 10.2 Setup Screen Mode Switch
Primary file:
- `src/App.tsx`

Add a clear switch or segmented control:
- `Workout Setup`
- `Session Builder`

Rules:
- `Workout Setup` preserves current screen
- `Session Builder` shows the new session editor

### 10.3 Session Builder Canvas
Create components:
- `src/components/SessionBuilder.tsx`
- `src/components/SessionCanvas.tsx`
- `src/components/SessionNodeCard.tsx`
- `src/components/SessionNodeEditor.tsx`

Canvas behavior:
- linear lane, not freeform
- fixed `Start` and `End` markers
- node cards rendered in order between them
- buttons to add nodes at end and between nodes
- move left/right controls for each node

Node summaries:
- workout node shows:
  - name
  - cycles
  - activation reps/pace
  - myo reps/rest if multi-set
- rest node shows:
  - name
  - rest seconds

### 10.4 Workout Node Editor
Reuse the current setup form fields.

Rules:
- editing a workout node should not mutate the global current workout setup unless explicitly intended
- use a node-local draft in the editor, then commit back into the session draft

### 10.5 Rest Node Editor
Simple editor:
- `name`
- `seconds`

### 10.6 Saved Workout Integration in Builder
In the session builder, include actions:
- `Add workout node from current setup`
- `Add workout node from saved workout`

Behavior:
- when created from a saved workout, copy its current config into the node
- store `sourceWorkoutId` for traceability
- do not live-update the node when the source workout changes later

## 11. Runtime Execution Spec

### 11.1 Session Start
When `startSession(id)` is called:
- load target session
- set `activeSessionId`
- set `activeSessionNodeIndex = 0`
- set `sessionStatus = 'running'`
- call `startSessionNode(0)`

### 11.2 Workout Node Runtime
When active node is `workout`:
- copy node config into existing workout config state
- start the existing workout flow using the current engine
- mark `sessionNodeRuntimeType = 'workout'`

The workout engine remains unchanged except for allowing the session runner to observe when the workout completes.

### 11.3 Rest Node Runtime
When active node is `rest`:
- do not use workout reps/cycles
- set:
  - `appPhase = 'timer'`
  - a dedicated session-rest display mode
  - `sessionRestTimeLeft = seconds`
- run the timer loop using the same worker-driven timing model where practical
- when rest reaches zero, complete the node

### 11.4 Node Completion
When a node completes:
- if there is another node:
  - increment `activeSessionNodeIndex`
  - start next node
- otherwise:
  - set `sessionStatus = 'finished'`
  - stop any timers

### 11.5 Pause/Resume
Pause and resume must work for:
- workout-node execution
- rest-node execution

Rules:
- pausing a session while on a workout node should pause the underlying workout timer
- pausing a session while on a rest node should pause the rest timer

## 12. App Integration
Primary file:
- `src/App.tsx`

Required integration points:
- route setup screen between workout mode and session-builder mode
- render session runtime status when a session is active
- preserve current workout-only mode behavior

Recommended approach:
- add a top-level derived mode:
  - workout setup
  - session builder
  - workout timer
  - session timer

Avoid burying too many conditions in one branch. If `App.tsx` becomes too large, split view components:
- `WorkoutSetupView`
- `SessionBuilderView`
- `WorkoutTimerView`
- `SessionTimerView`

## 13. Persistence
Add sessions to the existing persisted store partialization:
- `savedSessions`
- optionally `selectedSavedSessionId`

Do not persist:
- active session runtime state
- current session timer progress
- node runtime state

## 14. Migration Strategy
No destructive migration is needed for existing users.

Rules:
- existing persisted `savedWorkouts` remain valid
- new `savedSessions` field defaults to `[]`
- missing session-related persisted fields must hydrate safely

## 15. Test Matrix

### 15.1 Utility Tests
Create:
- `src/__tests__/savedSessions.test.ts`

Test:
- create workout node
- create rest node
- session validation
- node reordering
- clone behavior

### 15.2 Store Tests
Extend:
- `src/__tests__/useWorkoutStore.test.ts`

Test:
- create session
- save/load/rename/delete session
- add workout node from current setup
- add workout node from saved workout
- add/edit/delete rest node
- reorder nodes
- start session
- advance from workout node to rest node
- advance from rest node to workout node
- finish session
- pause/resume session on both node types

### 15.3 UI Tests
Extend or add:
- `src/__tests__/App.test.tsx`
- `src/__tests__/Sidebar.test.tsx`
- `src/__tests__/SessionBuilder.test.tsx`

Test:
- switch between workout setup and session builder
- render session canvas
- add and edit nodes
- sidebar session actions
- start session from UI

## 16. Suggested File Additions
- `src/types/savedSessions.ts`
- `src/utils/savedSessions.ts`
- `src/components/SessionBuilder.tsx`
- `src/components/SessionCanvas.tsx`
- `src/components/SessionNodeCard.tsx`
- `src/components/SessionNodeEditor.tsx`
- `src/__tests__/savedSessions.test.ts`
- `src/__tests__/SessionBuilder.test.tsx`

## 17. Suggested File Modifications
- `src/store/useWorkoutStore.ts`
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/__tests__/useWorkoutStore.test.ts`
- `src/__tests__/App.test.tsx`
- `src/__tests__/Sidebar.test.tsx`

## 18. Delivery Plan for Subagents

### Agent A: Session Types and Utilities
Owns:
- `src/types/savedSessions.ts`
- `src/utils/savedSessions.ts`
- `src/__tests__/savedSessions.test.ts`

Deliver:
- session types
- session/node validators
- creation/clone/reorder helpers

### Agent B: Store and Runtime
Owns:
- `src/store/useWorkoutStore.ts`
- relevant store tests in `src/__tests__/useWorkoutStore.test.ts`

Deliver:
- persistent session state
- session CRUD
- session runner
- node progression logic

### Agent C: Session Builder UI
Owns:
- `src/components/SessionBuilder.tsx`
- `src/components/SessionCanvas.tsx`
- `src/components/SessionNodeCard.tsx`
- `src/components/SessionNodeEditor.tsx`
- `src/__tests__/SessionBuilder.test.tsx`

Deliver:
- linear canvas builder
- node CRUD UI
- node summaries/editors

### Agent D: Sidebar and Entry Points
Owns:
- `src/components/Sidebar.tsx`
- sidebar tests

Deliver:
- saved sessions list/actions
- entry points into builder/start flow
- saved workout -> session node entry hooks

### Agent E: App Shell Integration
Owns:
- `src/App.tsx`
- app tests

Deliver:
- mode switching
- session builder mount
- session runtime view integration

## 19. Recommended Execution Order
1. Agent A and Agent B in parallel
2. Agent C and Agent D in parallel after types/store contracts stabilize
3. Agent E last for final integration
4. Final pass on tests and UX polish in main thread

## 20. Acceptance Criteria
Feature is complete when:
- users can create, edit, save, rename, duplicate, and delete sessions
- users can add workout nodes and rest nodes
- users can create workout nodes from saved workouts
- users can run a full session end-to-end
- workout nodes reuse the existing workout timing engine
- rest nodes run as standalone timed rests
- existing saved workouts still work exactly as before
- tests cover core session utilities, store logic, and UI interactions

## 21. Final Notes
- Keep v1 linear.
- Do not overbuild graph behavior.
- Do not merge session orchestration into the existing workout FSM more than necessary.
- Prefer explicit separation between workout runtime and session runtime.
