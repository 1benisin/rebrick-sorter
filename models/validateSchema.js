// Validate incoming data when creating or updating a obj
export default function validateSchema(obj, schema) {
  for (const field in schema) {
    // check required fields
    if (schema[field]?.required && !obj[field]) {
      return { error: `Field ${field} is required.` };
    }
    // if field exists in obj
    if (obj[field]) {
      // check field type
      switch (schema[field].type) {
        case 'string':
          if (typeof obj[field] !== 'string') {
            return { error: `Field ${field} must be a string.` };
          }
          break;
        case 'number':
          if (typeof obj[field] !== 'number') {
            return { error: `Field ${field} must be a number.` };
          }
          break;
        case 'boolean':
          if (typeof obj[field] !== 'boolean') {
            return { error: `Field ${field} must be a boolean.` };
          }
          break;
        case 'array':
          if (typeof obj[field] !== 'object' || obj[field].constructor !== Array) {
            return { error: `Field ${field} must be an array.` };
          }
          break;
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
