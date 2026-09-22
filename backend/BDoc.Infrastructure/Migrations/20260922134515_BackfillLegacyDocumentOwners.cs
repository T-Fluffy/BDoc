using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BDoc.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class BackfillLegacyDocumentOwners : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // One-off: pre-auth documents have NULL OwnerId. Assign them to the
            // oldest registered user so strict per-user isolation keeps them visible.
            // Guarded by EXISTS so it is a no-op on fresh databases with no users yet.
            migrationBuilder.Sql(@"
                UPDATE ""Documents""
                SET ""OwnerId"" = (SELECT ""Id"" FROM ""Users"" ORDER BY ""CreatedAt"" ASC LIMIT 1)
                WHERE ""OwnerId"" IS NULL
                  AND EXISTS (SELECT 1 FROM ""Users"");");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
