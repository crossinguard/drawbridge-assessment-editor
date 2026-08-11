<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { codeIsTaken, suggestCode, type CloneInclude } from '$lib/domain/clone';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { vaultList } from '$lib/stores/vaults.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  /*
    A route rather than a dialog, for two reasons the plan names and one it does not:
    there are seven controls, a reload should not throw the answers away, and "make me
    next term's course from this one" is a thing somebody arrives intending to do, which
    means it deserves a URL they can get back to.
  */

  const vaultId = $derived(page.params.vaultId ?? '');
  const source = $derived(activeVault.draft);

  let name = $state('');
  let code = $state('');
  let term = $state('');
  let busy = $state(false);
  let failure = $state<string | null>(null);

  /*
    The commonest answer, pre-ticked: same structure and settings, new questions. Items
    are the one thing a new term usually rewrites, and outcomes and rubrics are the part
    that took an afternoon to get right.
  */
  let include = $state<CloneInclude>({
    outcomes: true,
    rubrics: true,
    collections: true,
    items: false
  });

  onMount(() => void vaultList.load());

  /*
    Seeded once, from a settled value, rather than derived. An effect that kept rewriting
    these would fight every keystroke — the trap CLAUDE.md records about `$effect`
    reading state it only means to USE.
  */
  let seeded = $state(false);
  $effect(() => {
    if (seeded || !source || vaultList.status !== 'ready') return;
    seeded = true;
    name = `${source.name} (copy)`;
    code = suggestCode(source.code, vaultList.items);
    term = source.term ?? '';
  });

  // Items without their collections would be unreachable, so the combination is not
  // offered. `cloneSnapshot` enforces it as well; this is only the half the user sees.
  $effect(() => {
    if (!include.collections && include.items) include.items = false;
  });

  /*
    Checked against EVERY course, the source included. This is a create form, not a
    rename: the copy is a new record, so the course it was copied from is as much of a
    conflict as any other. Excluding self is the reflex here and it is wrong — it lets
    the one collision this form exists to prevent straight through.
  */
  const duplicate = $derived(codeIsTaken(code, vaultList.items));
  const ready = $derived(name.trim() !== '' && code.trim() !== '' && !duplicate && !busy);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!ready || !source) return;

    busy = true;
    failure = null;
    try {
      const id = await vaultList.clone(source.id, {
        name: name.trim(),
        code: code.trim(),
        ...(term.trim() ? { term: term.trim() } : {}),
        include
      });
      await goto(`/v/${id}`);
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  const CONTENT: { key: keyof CloneInclude; label: string; hint: string }[] = [
    {
      key: 'outcomes',
      label: 'Outcomes',
      hint: 'The whole tree, codes and all. Leave them out and nothing in the copy is aligned to anything.'
    },
    {
      key: 'rubrics',
      label: 'Rubrics',
      hint: 'Every rubric, with its levels and criteria. They come as a set, so a shared tail stays attached.'
    },
    {
      key: 'collections',
      label: 'Collections',
      hint: 'The quizzes, exams, tasks and their sections — the structure, without necessarily the questions.'
    },
    {
      key: 'items',
      label: 'Items',
      hint: 'The questions themselves. Leave them out for the usual case: same shape, written fresh.'
    }
  ];
</script>

<svelte:head><title>Copy {source?.name ?? 'course'} — Drawbridge</title></svelte:head>

{#if source}
  <div class="mx-auto flex max-w-3xl flex-col gap-5">
    <header class="flex flex-col gap-1">
      <a
        href="/v/{vaultId}"
        class="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
      >
        ← {source.name}
      </a>
      <h1 class="text-xl font-semibold tracking-tight">Copy this course</h1>
      <p class="max-w-prose text-sm text-text-muted">
        The new course keeps this one's settings — statuses, collection kinds, level sets,
        tag dimensions and custom fields — whatever else you bring across. Nothing here
        touches
        <span class="font-medium text-text">{source.name}</span>.
      </p>
    </header>

    <form class="flex flex-col gap-5" onsubmit={submit}>
      <Card title="The new course">
        <div class="grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            {#snippet children({ id })}
              <TextInput {id} bind:value={name} required />
            {/snippet}
          </Field>
          <Field
            label="Code"
            hint={duplicate ? undefined : 'Must differ from every other course.'}
          >
            {#snippet children({ id })}
              <TextInput {id} bind:value={code} required aria-invalid={duplicate} />
            {/snippet}
          </Field>
          <Field label="Term">
            {#snippet children({ id })}
              <TextInput {id} bind:value={term} placeholder="Spring 2027" />
            {/snippet}
          </Field>
        </div>
        {#if duplicate}
          <!--
            Blocking rather than advisory, unlike almost everything else in this app.
            The code is indexed and is what a merge-import falls back to when ids do not
            match, so two courses sharing one makes a later restore pick an arbitrary
            row — a wrong course quietly overwritten, found out much later.
          -->
          <p class="mt-2 text-xs text-danger">
            Another course already uses <span class="font-medium">{code.trim()}</span>. Codes
            have to be unique: importing a bundle later matches on the code when the ids do
            not line up, and two courses sharing one would make that pick the wrong course.
          </p>
        {/if}
      </Card>

      <Card
        title="What comes with it"
        description="Settings always come across. Everything below is optional."
      >
        <ul class="flex flex-col gap-3">
          {#each CONTENT as entry (entry.key)}
            {@const forced = entry.key === 'items' && !include.collections}
            <li>
              <label class="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  class="mt-0.5 size-4 shrink-0"
                  checked={include[entry.key]}
                  disabled={forced}
                  onchange={(event) => (include[entry.key] = event.currentTarget.checked)}
                />
                <span class="min-w-0">
                  <span class="block text-sm font-medium">{entry.label}</span>
                  <span class="block text-xs text-text-muted">
                    {forced
                      ? 'An item has to live in a collection, so this needs collections above.'
                      : entry.hint}
                  </span>
                </span>
              </label>
            </li>
          {/each}
        </ul>
      </Card>

      {#if failure}
        <p class="text-sm text-danger">The copy did not happen: {failure}</p>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={!ready}>
          {busy ? 'Copying…' : 'Create the copy'}
        </Button>
        <Button type="button" variant="ghost" onclick={() => goto(`/v/${vaultId}`)}>Cancel</Button>
      </div>
    </form>
  </div>
{:else}
  <p class="text-sm text-text-muted">Opening…</p>
{/if}
