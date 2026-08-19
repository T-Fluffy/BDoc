using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;
using BDoc.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BDoc.Infrastructure.Repositories;

public class DocumentRepository : IDocumentRepository
{
    private readonly EditorDbContext _context;

    public DocumentRepository(EditorDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Document>> GetAllAsync() =>
        await _context.Documents.OrderByDescending(d => d.UpdatedAt).ToListAsync();

    public async Task<Document> GetByIdAsync(Guid id) =>
        await _context.Documents.FindAsync(id) ?? throw new Exception("Document not found");

    public async Task CreateAsync(Document document)
    {
        _context.Documents.Add(document);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Document document)
    {
        document.UpdatedAt = DateTime.UtcNow;
        _context.Documents.Update(document);
        await _context.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid id)
    {
        var doc = await _context.Documents.FindAsync(id);
        if (doc != null)
        {
            _context.Documents.Remove(doc);
            await _context.SaveChangesAsync();
        }
    }
}