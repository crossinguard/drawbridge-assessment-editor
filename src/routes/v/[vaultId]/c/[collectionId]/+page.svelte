<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { collectionPoints, describePoints, type ScoringContext } from '$lib/domain/points';
  import { validateVault, type Issue } from '$lib/domain/validate';
  import { ALL_CAPABILITIES, capabilitiesOf } from '$lib/domain/collections';
  import type { ItemKind } from '$lib/domain/schema';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { collections } from '$lib/stores/collections.svelte';
  import { items } from '$lib/stores/items.svelte';
  import { outcomes } from '$lib/stores/outcomes.svelte';
  import { backup } from '$lib/stores/backup.svelte';
  import { rubrics } from '$lib/stores/rubrics.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import SaveIndicator from '$lib/components/SaveIndicator.svelte';
  import ProblemsPanel from '$lib/components/ProblemsPanel.svelte';
  import ItemCard from '$lib/components/items/ItemCard.svelte';
  import MarkdownField from '$lib/components/ui/MarkdownField.svelte';

  const vaultId = $derived(page.params.vaultId ?? '');
  const collectionId = $derived(page.params.collectionId ?? '');
  const vault = $derived(activeVault.draft);
  const collection = $derived(collections.open);

  // Each depends on its own id and nothing else. Reading the records here would
  // reload them on every keystroke and discard the edit in flight.
  $effect(() => {
    void collections.load(vaultId);
    void collections.openCollection(collectionId);
  });
  $effect(() => {
    void items.load(collectionId);
  });
  $effect(() => {
    void outcomes.load(vaultId);
  });

  $effect(() => {
    void rubrics.load(vaultId);
  });
  const scoring = $derived<ScoringContext>({
    rubricsById: new Map(rubrics.items.map((rubric) => [rubric.id, rubric]))
  });

  onMount(() => {
    const flush = () => {
      void items.flush();
      void collections.flush();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  });

  /*
    What this kind of collection can do, resolved once and passed down as an object.
    Nothing below — here or in any component — asks which kind it is; that is the whole
    point, and the reason a course can invent a kind without a code change.
  */
  const capabilities = $derived(
    vault && collection ? capabilitiesOf(vault.config, collection.kind) : ALL_CAPABILITIES
  );

  const sections = $derived([...(collection?.sections ?? [])].sort((a, b) => a.order - b.order));

  /** Where an item could be moved to: every other collection in this vault. */
  const elsewhere = $derived(
    collections.items.filter((entry) => entry.id !== collectionId).sort((a, b) => a.order - b.order)
  );

  // Passages other items can read from. Top-level only: a stimulus tucked inside a
  // group belongs to that group's parts, not to the collection at large.
  const stimuli = $derived(items.items.filter((item) => item.kind === 'stimulus'));

  const total = $derived(
    collection ? collectionPoints(collection, items.items, scoring) : null
  );

  /*
    Validation runs over this collection only, but through the full vault validator so
    the rules stay in one place. The other collections are passed as empty, which is
    why coverage warnings are filtered out below — "not assessed anywhere" is not a
    statement this screen is in a position to make.
  */
  const issues = $derived.by(() => {
    if (!vault || !collection) return [] as Issue[];
    return validateVault({
      vault,
      outcomes: outcomes.items,
      collections: [collection],
      itemsByCollection: new Map([[collection.id, items.items]]),
      rubrics: rubrics.items
    }).filter((issue) => !issue.ruleId.startsWith('coverage.'));
  });

  const issuesByEntity = $derived.by(() => {
    const grouped = new Map<string, Issue[]>();
    for (const issue of issues) {
      const existing = grouped.get(issue.entityId);
      if (existing) existing.push(issue);
      else grouped.set(issue.entityId, [issue]);
    }
    return grouped;
  });

  let focusId = $state<string | null>(null);
  let newSectionTitle = $state('');
  let addingSection = $state(false);

  const defaultStatus = $derived(vault?.config.statuses[0]?.key ?? '');

  async function addItem(kind: ItemKind, sectionId: string | undefined) {
    const created = await items.add(kind, sectionId, defaultStatus);
    focusId = created.id;
  }

  function addSection(event: SubmitEvent) {
    event.preventDefault();
    if (!newSectionTitle.trim()) return;
    collections.addSection(newSectionTitle.trim());
    newSectionTitle = '';
    addingSection = false;
  }

  async function removeCollection() {
    if (!collection) return;
    if (
      !confirm(
        `Delete "${collection.title}" and its ${items.items.length} item${
          items.items.length === 1 ? '' : 's'
        }? Undo can bring them back while this tab is open.`
      )
    )
      return;
    await collections.remove(collection.id);
    items.reset();
    await goto(`/v/${vaultId}/collections`);
  }

</script>

<svelte:head><title>{collection?.title ?? 'Collection'} — Drawbridge</title></svelte:head>

{#if collection && vault}
  <div class="mx-auto flex max-w-4xl flex-col gap-4">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/v/{vaultId}/collections"
          class="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
        >
          ← Collections
        </a>
        <SaveIndicator saver={items.saver} />
      </div>

      <input
        class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xl
               font-semibold tracking-tight hover:border-border-subtle focus:border-border-strong
               focus:bg-surface focus:outline-2 focus:outline-accent"
        bind:value={collection.title}
        oninput={() => collections.queueSave()}
        aria-label="Collection title"
      />

      <div class="flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span>{items.items.length} item{items.items.length === 1 ? '' : 's'}</span>
        {#if total}
          <span>·</span>
          <span>{describePoints(total)} total</span>
        {/if}
        <span>·</span>
        <label class="flex items-center gap-1">
          Declared
          <input
            type="number"
            step="any"
            class="w-16 rounded border border-border-subtle bg-surface px-1.5 py-0.5
                   focus:border-border-strong focus:outline-2 focus:outline-accent"
            value={collection.declaredPoints ?? ''}
            oninput={(event) => {
              const raw = event.currentTarget.value;
              if (raw === '') delete collection.declaredPoints;
              else collection.declaredPoints = Number(raw);
              collections.queueSave();
            }}
            placeholder="—"
            aria-label="Declared points"
          />
        </label>
        <!--
          A rubric on the COLLECTION scores the whole thing at once — a task or a
          discussion marked as one piece. Its items then become structure rather than
          score, which is why the total above switches to the rubric's.

          Where that is the normal way to work, the kind says `rubricFirst` and the
          control moves out of this row into a block of its own below. Buried in a row
          of small print it reads as a footnote, which is the wrong weight for the
          thing that decides what the assessment is worth.
        -->
        {#if !capabilities.rubricFirst}
          <span>·</span>
          <label class="flex items-center gap-1">
            Scored by
            <select
              class="rounded border border-border-subtle bg-surface px-1.5 py-0.5
                     focus:border-border-strong focus:outline-2 focus:outline-accent"
              value={collection.rubricId ?? ''}
              onchange={(event) => {
                const next = event.currentTarget.value;
                if (next) collection.rubricId = next;
                else delete collection.rubricId;
                collections.queueSave();
              }}
              aria-label="Collection rubric"
            >
              <option value="">its items</option>
              {#each rubrics.items as rubric (rubric.id)}
                <option value={rubric.id}>{rubric.title || 'Untitled rubric'}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    </header>

    {#if capabilities.rubricFirst}
      {@const scoringRubric = collection.rubricId
        ? rubrics.items.find((entry) => entry.id === collection.rubricId)
        : undefined}
      <section
        class="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-raised p-4"
      >
        <label class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium">Scored by</span>
          <select
            class="rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm
                   focus:border-border-strong focus:outline-2 focus:outline-accent"
            value={collection.rubricId ?? ''}
            onchange={(event) => {
              const next = event.currentTarget.value;
              if (next) collection.rubricId = next;
              else delete collection.rubricId;
              collections.queueSave();
            }}
            aria-label="Collection rubric"
          >
            <option value="">its items, one by one</option>
            {#each rubrics.items as rubric (rubric.id)}
              <option value={rubric.id}>{rubric.title || 'Untitled rubric'}</option>
            {/each}
          </select>
          {#if scoringRubric}
            <a
              href="/v/{vaultId}/rubrics/{scoringRubric.id}"
              class="text-xs underline underline-offset-2 hover:text-accent"
            >
              Edit the rubric →
            </a>
          {/if}
        </label>
        <p class="max-w-prose text-xs text-text-muted">
          {#if scoringRubric}
            One rubric scores the whole thing, so what is below is the prompt and its
            materials rather than a list of separately marked questions.
          {:else}
            Nothing scores this yet. Attach a rubric and it is marked as one piece; leave
            it and the items below are added up instead.
          {/if}
        </p>
      </section>
    {/if}

    <div class="grid gap-3 sm:grid-cols-2">
      <MarkdownField
        bind:value={collection.description}
        label="Description"
        rows={2}
        placeholder="What this covers, for your own reference"
        oninput={() => collections.queueSave()}
      />
      <MarkdownField
        bind:value={collection.instructions}
        label="Instructions"
        rows={2}
        placeholder="What the student is told before starting"
        oninput={() => collections.queueSave()}
      />
    </div>

    <ProblemsPanel {issues} subject="this collection" />

    {#snippet itemList(sectionId: string | undefined)}
      {@const list = items.inSection(sectionId)}
      <div class="flex flex-col gap-2">
        {#each list as item, index (item.id)}
          <ItemCard
            {item}
            position={index}
            total={list.length}
            {vault}
            outcomes={outcomes.items}
            {sections}
            issues={issuesByEntity.get(item.id) ?? []}
            rubrics={rubrics.items}
            {stimuli}
            {elsewhere}
            {scoring}
            {capabilities}
            {focusId}
            onFocused={() => (focusId = null)}
          />
        {/each}

        <!--
          The palette is whatever this kind offers. An empty list is a real answer —
          a task scored wholly by one rubric adds nothing — so say so rather than
          leaving a bare gap that reads as a rendering failure.
        -->
        {#if capabilities.itemKinds.length > 0}
          <div class="flex flex-wrap items-center gap-1.5">
            {#each capabilities.itemKinds as kind (kind)}
              <Button size="sm" onclick={() => addItem(kind, sectionId)}>+ {kind}</Button>
            {/each}
          </div>
        {:else if list.length === 0}
          <p class="text-xs text-text-muted">
            This kind of collection holds no items of its own — it is scored as one piece.
            Settings can widen what it offers.
          </p>
        {/if}
      </div>
    {/snippet}

    {@render itemList(undefined)}

    <!--
      Sections that already exist are always rendered, even where the kind no longer
      offers them: hiding a section would hide the items inside it, which is data loss
      as far as anyone looking at the screen can tell. Only the "+ Section" control is
      withheld.
    -->
    {#each sections as section, index (section.id)}
      <section class="flex flex-col gap-2">
        <div class="flex items-center gap-2 border-t border-border-subtle pt-4">
          <input
            class="min-w-0 grow rounded border border-transparent bg-transparent px-1 py-0.5
                   text-sm font-semibold hover:border-border-subtle focus:border-border-strong
                   focus:bg-surface focus:outline-2 focus:outline-accent"
            bind:value={section.title}
            oninput={() => collections.queueSave()}
            aria-label="Section title"
          />
          <IconButton
            name="up"
            title="Move up"
            aria-label="Move section up"
            disabled={index === 0}
            onclick={() => collections.moveSection(section.id, -1)}
          />
          <IconButton
            name="down"
            title="Move down"
            aria-label="Move section down"
            disabled={index === sections.length - 1}
            onclick={() => collections.moveSection(section.id, 1)}
          />
          <IconButton
            name="close"
            tone="danger"
            aria-label="Remove section"
            title="Removes the heading; its items move back to the top"
            onclick={() => collections.removeSection(section.id)}
          />
        </div>
        {@render itemList(section.id)}
      </section>
    {/each}

    <div class="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
      {#if capabilities.sections}
        {#if addingSection}
          <form class="flex items-center gap-2" onsubmit={addSection}>
            <input
              class="rounded border border-border-subtle bg-surface px-2 py-1 text-sm
                     focus:border-border-strong focus:outline-2 focus:outline-accent"
              bind:value={newSectionTitle}
              placeholder="Part I — Descriptive statistics"
              aria-label="New section title"
            />
            <Button size="sm" type="submit" variant="primary">Add</Button>
            <Button size="sm" type="button" variant="ghost" onclick={() => (addingSection = false)}>
              Cancel
            </Button>
          </form>
        {:else}
          <Button size="sm" onclick={() => (addingSection = true)}>+ Section</Button>
        {/if}
      {/if}
      <Button
        size="sm"
        disabled={backup.busy}
        onclick={() => backup.exportCollection(vaultId, collection.id)}
      >
        Export this collection
      </Button>
      <Button size="sm" variant="danger" onclick={removeCollection}>Delete collection</Button>
    </div>
  </div>
{:else}
  <p class="text-sm text-text-muted">Opening…</p>
{/if}
