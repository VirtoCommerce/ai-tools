# xUnit + Moq patterns for VC backend fixes

Concise recipes for encoding a VC bug as a failing xUnit test. Match the target repo's existing test
style first; these are fallbacks.

## The verified test stack (survey of dev-branch modules, 2026-06)

| Package | Version seen | Notes |
|---------|-------------|-------|
| `xunit.v3` | 3.2.x | The **v3** line — same `[Fact]`/`[Theory]` attributes; don't add classic `xunit` 2.x packages alongside |
| `Microsoft.NET.Test.Sdk` | 18.x | uniform |
| `Moq` | 4.20.x | uniform where mocking is used |
| `FluentAssertions` | **7.2.0** | common but **not universal** (vc-module-customer: none). Pinned to the last MIT major — **never bump to 8+** (paid license) |
| `MockQueryable.Moq` | 10.x | for mocking EF `IQueryable`/`DbSet` repositories |
| `AutoFixture` / `Bogus` | 4.x / 35.x | only in some repos (inventory, x-cart) — check before using |

TFM is `net10.0` per-csproj; `Directory.Build.props` sets `TreatWarningsAsErrors=true` (a new warning
in your test code fails the build). Read the test csproj — use only packages already referenced.

## Test project & naming
- Tests live in `tests/VirtoCommerce.<Name>.Tests/` — but verify: pricing uses `.Test` (singular),
  marketing has sibling `*.Benchmark.*` projects (ignore those), x-cart organizes specs into
  subfolders (Aggregates/, Handlers/, Validators/, …) — put the new test in the matching one.
- Files are `<Subject>Tests.cs` / `<Subject>UnitTests.cs`; some repos share a `<Name>TestsBase.cs`
  base class — reuse it if neighbors do.
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
    result.Should().NotContain(p => p.List == 0m);          // FluentAssertions 7.x, if referenced
    // Assert.DoesNotContain(result, p => p.List == 0m);    // plain xUnit otherwise
}
```

## Theory for boundary/BVA bugs
```csharp
[Theory]
[InlineData(0)] [InlineData(-1)] [InlineData(int.MaxValue)]
public void ClampQuantity_OutOfRange_Throws_VCST1234(int qty) { /* ... */ }
```

## EF repository mocking (MockQueryable)
```csharp
var entities = new List<InventoryEntity> { /* seeded state */ };
var mockSet = entities.AsQueryable().BuildMockDbSet();    // MockQueryable.Moq
repoMock.Setup(r => r.Inventories).Returns(mockSet.Object);
```

## GraphQL resolver repro (vc-module-x-*)
- Test the resolver/aggregation/handler method directly (not via HTTP). Assert the field the symptom
  is about.
- Verify the contract/field name against the schema before asserting — don't bake in the bug.
- x-* test projects reference Platform/module packages as **NuGet** (no Web project ref) — if the
  root cause is in one of those packages, that's cross-module → STOP, don't patch around it.

## Tips
- Mock at the smallest boundary; don't spin up the whole module.
- Assert the **business invariant** (cite the `BL-*` id in a comment), not just the literal value.
- Keep the test deterministic — no clock/random/network. Inject those.
- Confirm RED first with the scoped, filtered command (see SKILL.md step 6), then implement the fix.
