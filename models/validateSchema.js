export default function validateSchema(obj, schema, log = false) {
  for (const field in schema) {
    // check required fields
    if (schema[field]?.required && !obj[field]) {
      const error = `Field ${field} is required.`;
      if (log) console.error(`[${obj.id}] ${error}`);
      return { error };
    }

    // if field exists in obj
    if (obj[field]) {
      // check field type
      switch (schema[field].type) {
        case 'string':
          if (typeof obj[field] !== 'string') {
            const error = `Field ${field} must be a string.`;
            if (log) console.error(`[${obj.id}] ${error}`);
            return { error };
          }
          break;
        case 'number':
          if (typeof obj[field] !== 'number') {
            const error = `Field ${field} must be a number.`;
            if (log) console.error(`[${obj.id}] ${error}`);
            return { error };
          }
          break;
        case 'boolean':
          if (typeof obj[field] !== 'boolean') {
            const error = `Field ${field} must be a boolean.`;
            if (log) console.error(`[${obj.id}] ${error}`);
            return { error };
          }
          break;
        case 'array':
          if (typeof obj[field] !== 'object' || obj[field].constructor !== Array) {
            const error = `Field ${field} must be an array.`;
            if (log) console.error(`[${obj.id}] ${error}`);
            return { error };
          }
          break;
        case 'object':
          if (typeof obj[field] !== 'object' || obj[field].constructor === Array) {
            const error = `Field ${field} must be an object.`;
            if (log) console.error(`[${obj.id}] ${error}`);
            return { error };
          }
      }

      // check field conditions
      if (schema[field]?.conditions) {
        for (const condition of schema[field].conditions) {
          if (condition(obj[field])) {
            const error = `Field ${field} does not meet the required condition.`;
            if (log) console.error(`[${obj.id}] ${error}`);
            return { error };
          }
        }
      }
    }
  }

  // remove any properties that are not in the schema
  const result = {};
  for (const key in obj) {
    if (key in schema) result[key] = obj[key];
  }
  return result;
}
