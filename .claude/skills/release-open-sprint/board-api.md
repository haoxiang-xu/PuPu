# Shared board plumbing (all release-* skills)

## Preflight (run before anything else)

```bash
gh auth status 2>&1 | grep -i scope   # must contain "project"
```

Missing `project` scope → tell the founder to run `! gh auth refresh -s project` in the prompt box, then STOP. Never proceed degraded.

## Discover project + fields (do not hardcode IDs)

```bash
# Find the PuPu board (pick the open project whose title matches PuPu / whose items are PuPu issues)
gh api graphql -f query='query{user(login:"haoxiang-xu"){projectsV2(first:10){nodes{id number title closed}}}}'

# Discover fields: need Status, Size, and the Sprint field (iteration or single-select — take whatever exists)
gh api graphql -f query='query{node(id:"PROJECT_ID"){... on ProjectV2{fields(first:30){nodes{... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{id name options{id name}} ... on ProjectV2IterationField{id name configuration{iterations{id title}}}}}}}}'
```

Cache discovered IDs in `.claude/archive/sprints/board-ids.json` (`{project_id, project_number, fields:{...}, cached}`); on any ID-mismatch error, re-discover and rewrite the cache.

## Item operations

```bash
# List items with field values (paginate with after:)
gh api graphql -f query='query{node(id:"PROJECT_ID"){... on ProjectV2{items(first:100){pageInfo{hasNextPage endCursor}nodes{id content{... on Issue{number title state url}}fieldValues(first:15){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{name}}} ... on ProjectV2ItemFieldIterationValue{title field{... on ProjectV2FieldCommon{name}}}}}}}}}}'

# Create issue then add to board
gh issue create -R haoxiang-xu/PuPu --title "..." --body-file /tmp/body.md --label "new feature"
gh project item-add PROJECT_NUMBER --owner haoxiang-xu --url ISSUE_URL

# Set / clear a field value on an item
gh api graphql -f query='mutation{updateProjectV2ItemFieldValue(input:{projectId:"...",itemId:"...",fieldId:"...",value:{singleSelectOptionId:"..."}}){projectV2Item{id}}}'
gh api graphql -f query='mutation{clearProjectV2ItemFieldValue(input:{projectId:"...",itemId:"...",fieldId:"..."}){projectV2Item{id}}}'
```

## Repo labels (closed set — never create new labels)

`bug` `new feature` `improvement` `documentation` `refactor` `UI` `MISO` `MINI UI component` `help wanted` `question` `regular` `release` `Unchain`

## Sprint doc contract

Path: `.claude/archive/sprints/v{X.Y.Z}.md` (template: `.claude/archive/sprints/TEMPLATE.md`).
Iron rule for every release-* skill: **any board/ticket mutation must be mirrored into the sprint doc in the same run.** On doc↔board divergence, the board is truth — fix the doc.
