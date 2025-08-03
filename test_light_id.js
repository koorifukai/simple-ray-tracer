// Quick test for cascading light ID logic
// To simulate the getNextCascadingLightId function

function getNextCascadingLightId(currentLightId) {
    const lightIdStr = currentLightId.toString();
    
    // Count decimal places to determine next level
    const decimalIndex = lightIdStr.indexOf('.');
    if (decimalIndex === -1) {
        // No decimal places: 1 -> 1.1
        return currentLightId + 0.1;
    } else {
        // Has decimal places: add one more digit level
        const decimalPart = lightIdStr.substring(decimalIndex + 1);
        // Create increment for next level: 0.01, 0.001, 0.0001, etc.
        const nextIncrement = Math.pow(10, -(decimalPart.length + 1));
        return currentLightId + nextIncrement;
    }
}

try {
    // Test cases
    console.log("Testing cascading light ID system:");
    console.log("1 ->", getNextCascadingLightId(1));           // Should be 1.1
    console.log("1.1 ->", getNextCascadingLightId(1.1));       // Should be 1.11
    console.log("1.2 ->", getNextCascadingLightId(1.2));       // Should be 1.21
    console.log("1.11 ->", getNextCascadingLightId(1.11));     // Should be 1.111
    console.log("1.12 ->", getNextCascadingLightId(1.12));     // Should be 1.121
    console.log("2 ->", getNextCascadingLightId(2));           // Should be 2.1
    console.log("2.1 ->", getNextCascadingLightId(2.1));       // Should be 2.11
} catch (error) {
    console.error("Error:", error.message);
}
