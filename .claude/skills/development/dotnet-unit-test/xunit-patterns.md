# xUnit + Moq patterns for VC backend fixes

Concise recipes for encoding a VC bug as a failing xUnit test. Match the target repo's existing test
style first; these are fallbacks.

## Test project & naming
- Tests live in `tests/VirtoCommerce.<Name>.Tests/` (xUnit, often Moq + FluentAssertions/Shouldly).
- New test class/method named for the behavior + ticket, e.g.
  `CouponDiscountTests.AppliesToPostTierAmount_VCST1234`.

## Service-level repro (most common)
```csharp
[Fact]
public async Task GetPrices_WhenPriceListDeleted_DoesNotReturnZero_VCST1234()
{
    // Arrange — mock only the collaborators the seam needs
    var repo = new Mock<IPricingRepository>();
    repo.Setup(r => r.GetPricesByIdsAsync(It.IsAny<string[]>()))
        .ReturnsAsync(Array.Empty<PriceEntity>());
    var sut = new PricingService(repo.Object, /* ... */);

    // Act
    var result = await sut.EvaluateProductPricesAsync(ctx);

    // Assert — the EXPECTED post-fix behavior (currently fails)
    result.Should().NotContain(p => p.List == 0m);
}
```

## Theory for boundary/BVA bugs
```csharp
[Theory]
[InlineData(0)] [InlineData(-1)] [InlineData(int.MaxValue)]
public void ClampQuantity_OutOfRange_Throws_VCST1234(int qty) { /* ... */ }
```

## GraphQL resolver repro
- Test the resolver/aggregation method directly (not via HTTP). Assert the field the symptom is about.
- Verify the contract/field name against the schema before asserting — don't bake in the bug.

## Tips
- Mock at the smallest boundary; don't spin up the whole module.
- Assert the **business invariant** (cite the `BL-*` id in a comment), not just the literal value.
- Keep the test deterministic — no clock/random/network. Inject those.
- Confirm RED first (`dotnet test --nologo`), then implement the fix.
