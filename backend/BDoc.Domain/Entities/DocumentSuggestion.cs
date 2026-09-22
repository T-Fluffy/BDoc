namespace BDoc.Domain.Entities;

/// <summary>
/// A proposed text replacement. Quote-anchored (not position-anchored) so
/// concurrent edits cannot silently misapply it: if the quote is gone the
/// suggestion is stale and accept is rejected with 409.
/// Statuses: pending | accepted | rejected.
/// </summary>
public class DocumentSuggestion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public Guid AuthorId { get; set; }
    public string Quote { get; set; } = string.Empty;
    public string Replacement { get; set; } = string.Empty;
    public string Status { get; set; } = "pending";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
