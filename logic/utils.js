export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(low, high) {
  return Math.floor(Math.random() * high) + low;
}

export function splitArrayIntoGroups(array, parts) {
  const numberOfParts = Math.ceil(parts); // prevents decimal numbers
  let result = [];
  for (let i = numberOfParts; i > 0; i--) {
    result.push(array.splice(0, Math.ceil(array.length / i)));
  }
  return result;
}
