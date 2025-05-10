## Flow

```
compile
  ├─ parse           # Parse initial code into AST
  ├─ raise           # Raise the AST into high-level AST
  ├─ annotate        # Add initial type annotations
  ├─ check           # Validate types and structures
  │   └─ checkTerm
  │       ├─ inferTerm
  │       └─ checkTermLater
  ├─ lower           # Convert to intermediate representation (IR)
  ├─ prune           # Remove dead code
  ├─ inline          # Inline functions/values
  ├─ render          # Render final representation (e.g., bytecode)
  └─ file            # Output to a file

make
  load
  rise
  note
  test
    find
  cast
  toss
  line
  code
  file
```

## API Ideas

```ts
{
  $form: 'annotation',
  term,
  form,
}
```

## Notes

- `check` builds a bunch of annotations
  - then after building annotations

## Inspiration

- [Functional TS version of Kind language](https://github.com/cluesurf/make.tree/pull/1)
