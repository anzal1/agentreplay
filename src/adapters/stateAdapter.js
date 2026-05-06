import { sha256, stableStringify } from "../hash.js";

export function createEntityStateAdapter({ name, getEntities, idField = "id" }) {
  return {
    name,

    async snapshot() {
      const entities = await getEntities();
      return entities.map((entity) => ({ ...entity }));
    },

    async diff(before, after) {
      const beforeMap = mapById(before, idField);
      const afterMap = mapById(after, idField);
      const effects = [];

      for (const [id, entity] of afterMap.entries()) {
        if (!beforeMap.has(id)) {
          effects.push({ type: `${name}.created`, id, after: entity });
          continue;
        }

        const previous = beforeMap.get(id);
        if (stableStringify(previous) !== stableStringify(entity)) {
          effects.push({
            type: `${name}.updated`,
            id,
            beforeHash: sha256(previous),
            afterHash: sha256(entity),
            before: previous,
            after: entity
          });
        }
      }

      for (const [id, entity] of beforeMap.entries()) {
        if (!afterMap.has(id)) {
          effects.push({ type: `${name}.deleted`, id, before: entity });
        }
      }

      return effects;
    }
  };
}

function mapById(entities, idField) {
  return new Map(entities.map((entity) => [entity[idField], entity]));
}
